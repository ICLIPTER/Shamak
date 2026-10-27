import { axiosInstance } from "./axios";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);

  return output;
}

export function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.error("Service worker registration failed:", error.message);
    return null;
  }
}

/**
 * Remove any service worker previously registered on this origin (only called
 * in dev). Without this, an old worker keeps serving cached modules and the
 * every-load app shell, breaking the dev server after code changes.
 */
export async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    if (registrations.length > 0) {
      // The worker's cache storage survives unregistering — drop it too.
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    }
  } catch (error) {
    console.error("Service worker cleanup failed:", error.message);
  }
}

/** Returns a usable registration, registering the worker on demand. */
async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;

  let registration = await navigator.serviceWorker.getRegistration();

  if (!registration) {
    registration = await registerServiceWorker();
  }

  if (!registration) return null;

  await navigator.serviceWorker.ready;
  return registration;
}

export async function getPushState() {
  if (!supportsPush()) return "unsupported";

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "disabled";

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "disabled";

  return Notification.permission === "granted" ? "enabled" : "blocked";
}

export async function enablePush() {
  if (!supportsPush()) {
    throw new Error("This browser doesn't support notifications");
  }

  const { data } = await axiosInstance.get("/push/public-key");

  if (!data.enabled || !data.publicKey) {
    throw new Error("Push notifications are not configured on the server yet");
  }

  const registration = await getRegistration();
  if (!registration) throw new Error("Service worker is not available");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    }));

  await axiosInstance.post("/push/subscribe", {
    subscription: subscription.toJSON(),
  });

  return true;
}

export async function disablePush() {
  if (!supportsPush()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await axiosInstance
    .delete("/push/subscribe", { data: { endpoint: subscription.endpoint } })
    .catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

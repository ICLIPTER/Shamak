import { Button } from "@heroui/react";
import toast from "react-hot-toast";

function ChatPage() {
  return (
    <div>
      ChatPage
      <Button onClick={() => toast.success("you clicked")}>My Button</Button>
    </div>
  );
}

export default ChatPage;

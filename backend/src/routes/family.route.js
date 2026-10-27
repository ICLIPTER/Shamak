import express from "express";

import {
  createEvent,
  deleteEvent,
  listUpcoming,
  updateEvent,
} from "../controllers/event.controller.js";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "../controllers/note.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { writeLimiter } from "../middleware/rateLimit.middleware.js";

const eventRouter = express.Router();
eventRouter.use(protectRoute);
eventRouter.get("/", listUpcoming);
eventRouter.post("/", writeLimiter, createEvent);
eventRouter.patch("/:id", writeLimiter, updateEvent);
eventRouter.delete("/:id", writeLimiter, deleteEvent);

const noteRouter = express.Router();
noteRouter.use(protectRoute);
noteRouter.get("/", listNotes);
noteRouter.post("/", writeLimiter, createNote);
noteRouter.patch("/:id", writeLimiter, updateNote);
noteRouter.delete("/:id", writeLimiter, deleteNote);

export { eventRouter, noteRouter };

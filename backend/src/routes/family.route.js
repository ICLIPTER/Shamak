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

const eventRouter = express.Router();
eventRouter.use(protectRoute);
eventRouter.get("/", listUpcoming);
eventRouter.post("/", createEvent);
eventRouter.patch("/:id", updateEvent);
eventRouter.delete("/:id", deleteEvent);

const noteRouter = express.Router();
noteRouter.use(protectRoute);
noteRouter.get("/", listNotes);
noteRouter.post("/", createNote);
noteRouter.patch("/:id", updateNote);
noteRouter.delete("/:id", deleteNote);

export { eventRouter, noteRouter };

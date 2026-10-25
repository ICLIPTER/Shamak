import Note from "../models/note.model.js";

export async function listNotes(req, res) {
  try {
    const notes = await Note.find()
      .populate("createdBy", "fullName profilePic")
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(200)
      .lean();

    res.status(200).json(
      notes.map((note) => ({
        _id: String(note._id),
        title: note.title,
        body: note.body,
        category: note.category,
        pinned: note.pinned,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        createdBy: note.createdBy
          ? {
              _id: String(note.createdBy._id),
              fullName: note.createdBy.fullName,
              profilePic: note.createdBy.profilePic,
            }
          : null,
      })),
    );
  } catch (error) {
    console.error("Error in listNotes:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createNote(req, res) {
  try {
    const { title, body, category, pinned } = req.body || {};

    if (!title || !String(title).trim()) {
      res.status(400).json({ message: "A title is required" });
      return;
    }

    const note = await Note.create({
      title: String(title).trim().slice(0, 120),
      body: String(body || "").slice(0, 4000),
      category: ["info", "contact", "rule", "address", "reminder"].includes(
        category,
      )
        ? category
        : "info",
      pinned: Boolean(pinned),
      createdBy: req.user._id,
    });

    const populated = await note.populate("createdBy", "fullName profilePic");

    res.status(201).json(populated);
  } catch (error) {
    console.error("Error in createNote:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateNote(req, res) {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const canEdit =
      req.user.role === "admin" || note.createdBy.equals(req.user._id);

    if (!canEdit) {
      res.status(403).json({ message: "You cannot edit this note" });
      return;
    }

    for (const key of ["title", "body", "category", "pinned"]) {
      if (req.body?.[key] !== undefined) note[key] = req.body[key];
    }

    await note.save();
    const populated = await note.populate("createdBy", "fullName profilePic");

    res.status(200).json(populated);
  } catch (error) {
    console.error("Error in updateNote:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteNote(req, res) {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const canDelete =
      req.user.role === "admin" || note.createdBy.equals(req.user._id);

    if (!canDelete) {
      res.status(403).json({ message: "You cannot delete this note" });
      return;
    }

    await Note.deleteOne({ _id: note._id });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in deleteNote:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

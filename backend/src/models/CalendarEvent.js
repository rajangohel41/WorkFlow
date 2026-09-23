import mongoose from "mongoose"

const calendarEventSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    day: { type: Number, required: true, min: 1, max: 31 },
    time: { type: String, default: "" },
    color: { type: String, default: "indigo" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
)

export const CalendarEvent = mongoose.model("CalendarEvent", calendarEventSchema)

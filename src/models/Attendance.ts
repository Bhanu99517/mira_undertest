
import mongoose, { Schema, models, model } from 'mongoose';

const AttendanceSchema = new Schema({
  userId: { type: String, required: true }, // Can be the mongo _id or the PIN
  userName: { type: String, required: true },
  userPin: { type: String, required: true },
  userAvatar: { type: String },
  date: { type: String, required: true }, // YYYY-MM-DD
  status: { type: String, enum: ['Present', 'Absent'], default: 'Present' },
  timestamp: { type: String }, // HH:mm:ss
  location: {
    status: { type: String },
    coordinates: { type: String },
    distance_km: { type: Number }
  }
}, { timestamps: true });

export default models.Attendance || model('Attendance', AttendanceSchema);

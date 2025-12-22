
import mongoose, { Schema, models, model } from 'mongoose';

const UserSchema = new Schema({
  pin: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true }, // 'STUDENT', 'FACULTY', etc.
  branch: { type: String, required: true },
  year: { type: Number },
  college_code: { type: String },
  email: { type: String },
  email_verified: { type: Boolean, default: false },
  parent_email: { type: String },
  parent_email_verified: { type: Boolean, default: false },
  phoneNumber: { type: String },
  imageUrl: { type: String },
  referenceImageUrl: { type: String },
  password: { type: String },
  access_revoked: { type: Boolean, default: false },
}, { timestamps: true });

// Use existing model if present to prevent overwrite error in hot-reload
export default models.User || model('User', UserSchema);

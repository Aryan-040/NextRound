/**
 * User.ts
 * Mongoose model for application users.
 *
 * Passwords are never stored in plain text — only the bcrypt hash (cost 12)
 * is persisted. The email field is unique, lowercased, and trimmed at the
 * schema level so duplicate-email checks are case-insensitive by design.
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index is created automatically by `unique: true` in the email field above.
// No duplicate UserSchema.index() call here to avoid the Mongoose duplicate-index warning.

export default model<UserDocument>('User', UserSchema);

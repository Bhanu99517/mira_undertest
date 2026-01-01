
// api/users.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import mongoose, { Schema, models, model } from 'mongoose'
import dbConnect from './lib/dbConnect'

/* =========================
   User Schema & Model
========================= */

interface IUser {
  name: string
  pin: string
  role: 'SuperAdmin' | 'Principal' | 'HOD' | 'Faculty' | 'Staff' | 'Student'
  email?: string
  avatar?: string
  createdAt?: Date
  updatedAt?: Date
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    pin: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ['SuperAdmin', 'Principal', 'HOD', 'Faculty', 'Staff', 'Student'],
      required: true,
    },
    email: String,
    avatar: String,
  },
  { timestamps: true }
)

const User = models.User || model<IUser>('User', UserSchema)

/* =========================
   Helpers
========================= */

function getQueryParam(param?: string | string[]) {
  if (!param) return null
  return Array.isArray(param) ? param[0] : param
}

/* =========================
   API Handler
========================= */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  await dbConnect()

  try {
    /* =========================
       GET /api/users
       - ?pin=1234  → get user by pin
       - no query   → get all users
    ========================= */

    if (req.method === 'GET') {
      const pin = getQueryParam(req.query.pin)

      if (pin) {
        const user = await User.findOne({ pin }).lean()

        if (!user) {
          return res.status(404).json({ message: 'User not found' })
        }

        return res.status(200).json({
          ...user,
          id: user._id.toString(),
        })
      }

      const users = await User.find().lean()

      const formatted = users.map((u) => ({
        ...u,
        id: u._id.toString(),
      }))

      return res.status(200).json(formatted)
    }

    /* =========================
       POST /api/users
       - Create new user
    ========================= */

    if (req.method === 'POST') {
      const { name, pin, role, email, avatar } = req.body

      if (!name || !pin || !role) {
        return res.status(400).json({
          message: 'name, pin, and role are required',
        })
      }

      const existing = await User.findOne({ pin })
      if (existing) {
        return res.status(409).json({ message: 'User already exists' })
      }

      const user = await User.create({
        name,
        pin,
        role,
        email,
        avatar,
      })

      return res.status(201).json({
        ...user.toObject(),
        id: user._id.toString(),
      })
    }

    /* =========================
       PUT /api/users
       - Update user by pin
    ========================= */

    if (req.method === 'PUT') {
      const pin = getQueryParam(req.query.pin)

      if (!pin) {
        return res.status(400).json({ message: 'pin is required' })
      }

      const updatedUser = await User.findOneAndUpdate(
        { pin },
        req.body,
        { new: true }
      ).lean()

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' })
      }

      return res.status(200).json({
        ...updatedUser,
        id: updatedUser._id.toString(),
      })
    }

    /* =========================
       DELETE /api/users
       - Delete user by pin
    ========================= */

    if (req.method === 'DELETE') {
      const pin = getQueryParam(req.query.pin)

      if (!pin) {
        return res.status(400).json({ message: 'pin is required' })
      }

      const deleted = await User.findOneAndDelete({ pin }).lean()

      if (!deleted) {
        return res.status(404).json({ message: 'User not found' })
      }

      return res.status(200).json({
        message: 'User deleted successfully',
        id: deleted._id.toString(),
      })
    }

    /* =========================
       Method Not Allowed
    ========================= */

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error) {
    console.error('Users API error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

// api/users.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import mongoose, { Schema } from 'mongoose'
import dbConnect from './lib/dbConnect'

/* ================= MODEL ================= */

const UserSchema = new Schema(
  {
    name: String,
    pin: { type: String, unique: true },
    role: String,
    email: String,
    avatar: String,
  },
  { timestamps: true }
)

const User =
  mongoose.models.User || mongoose.model('User', UserSchema)

/* ================= UTILS ================= */

const qp = (v?: string | string[]) =>
  Array.isArray(v) ? v[0] : v

/* ================= HANDLER ================= */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  await dbConnect()

  try {
    if (req.method === 'GET') {
      const pin = qp(req.query.pin)

      const query: any = {}
      if (pin) query.pin = pin

      const users = await User.find(query).lean()

      return res.status(200).json(
        users.map((u: any) => ({ ...u, id: u._id.toString() }))
      )
    }

    if (req.method === 'POST') {
      const user = await User.create(req.body)
      return res.status(201).json({
        ...user.toObject(),
        id: user._id.toString(),
      })
    }

    if (req.method === 'PUT') {
      const pin = qp(req.query.pin)
      if (!pin) return res.status(400).json({ message: 'pin required' })

      const updated = await User.findOneAndUpdate(
        { pin } as any,
        req.body,
        { returnDocument: 'after' } as any
      ).lean()

      if (!updated) {
        return res.status(404).json({ message: 'Not found' })
      }

      return res.status(200).json({
        ...updated,
        id: updated._id.toString(),
      })
    }

    if (req.method === 'DELETE') {
      const pin = qp(req.query.pin)
      if (!pin) return res.status(400).json({ message: 'pin required' })

      const deleted = await User.findOneAndDelete({ pin } as any).lean()
      if (!deleted) {
        return res.status(404).json({ message: 'Not found' })
      }

      return res.status(200).json({
        message: 'Deleted',
        id: deleted._id.toString(),
      })
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
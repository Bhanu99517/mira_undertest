
// api/users.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Schema, model, models, FilterQuery } from 'mongoose'
import dbConnect from './lib/dbConnect'

interface IUser {
  name: string
  pin: string
  role: string
  email?: string
  avatar?: string
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    pin: { type: String, required: true, unique: true },
    role: { type: String, required: true },
    email: String,
    avatar: String,
  },
  { timestamps: true }
)

const User = models.User || model<IUser>('User', UserSchema)

const qp = (v?: string | string[]) =>
  Array.isArray(v) ? v[0] : v

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  await dbConnect()

  try {
    if (req.method === 'GET') {
      const pin = qp(req.query.pin)

      const filter: FilterQuery<IUser> = {}
      if (pin) filter.pin = pin

      const users = await User.find(filter).lean()

      return res.status(200).json(
        users.map(u => ({ ...u, id: u._id.toString() }))
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
        { pin } as FilterQuery<IUser>,
        req.body,
        { new: true }
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

      const deleted = await User.findOneAndDelete(
        { pin } as FilterQuery<IUser>
      ).lean()

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
    return res.status(500).json({ message: 'Internal error' })
  }
}
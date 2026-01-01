
// api/attendance.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Schema, model, models, FilterQuery } from 'mongoose'
import dbConnect from './lib/dbConnect'

/* ================= TYPES ================= */

interface IAttendance {
  date: string
  userId: string
  userName: string
  userPin: string
  status: 'Present' | 'Absent'
  userAvatar?: string
  timestamp?: string
  location?: {
    status?: string
    coordinates?: string
    distance_km?: number
  }
}

/* ================= SCHEMA ================= */

const AttendanceSchema = new Schema<IAttendance>(
  {
    date: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userPin: { type: String, required: true },
    status: { type: String, enum: ['Present', 'Absent'], required: true },
    userAvatar: String,
    timestamp: String,
    location: {
      status: String,
      coordinates: String,
      distance_km: Number,
    },
  },
  { timestamps: true }
)

const Attendance =
  models.Attendance || model<IAttendance>('Attendance', AttendanceSchema)

/* ================= HELPERS ================= */

const qp = (v?: string | string[]) =>
  Array.isArray(v) ? v[0] : v

/* ================= HANDLER ================= */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  await dbConnect()

  try {
    /* -------- GET -------- */
    if (req.method === 'GET') {
      const date = qp(req.query.date)
      const userPin = qp(req.query.userPin)

      const filter: FilterQuery<IAttendance> = {}
      if (date) filter.date = date
      if (userPin) filter.userPin = userPin

      const records = await Attendance.find(filter).lean()

      return res.status(200).json(
        records.map(r => ({ ...r, id: r._id.toString() }))
      )
    }

    /* -------- POST -------- */
    if (req.method === 'POST') {
      const body = req.body as IAttendance

      if (!body.date || !body.userId || !body.userName || !body.userPin) {
        return res.status(400).json({ message: 'Missing fields' })
      }

      const exists = await Attendance.findOne({
        date: body.date,
        userPin: body.userPin,
      } as FilterQuery<IAttendance>)

      if (exists) {
        return res.status(409).json({ message: 'Already marked' })
      }

      const doc = await Attendance.create({
        ...body,
        timestamp: new Date().toISOString(),
      })

      return res.status(201).json({
        ...doc.toObject(),
        id: doc._id.toString(),
      })
    }

    /* -------- PUT -------- */
    if (req.method === 'PUT') {
      const id = qp(req.query.id)
      if (!id) return res.status(400).json({ message: 'id required' })

      const updated = await Attendance.findByIdAndUpdate(
        id,
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

    /* -------- DELETE -------- */
    if (req.method === 'DELETE') {
      const id = qp(req.query.id)
      if (!id) return res.status(400).json({ message: 'id required' })

      const deleted = await Attendance.findByIdAndDelete(id).lean()
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
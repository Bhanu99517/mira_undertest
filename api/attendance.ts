
// api/attendance.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import mongoose, { Schema } from 'mongoose'
import dbConnect from './lib/dbConnect'

/* ================= MODEL ================= */

const AttendanceSchema = new Schema(
  {
    date: String,
    userId: String,
    userName: String,
    userPin: String,
    status: { type: String, enum: ['Present', 'Absent'] },
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
  mongoose.models.Attendance ||
  mongoose.model('Attendance', AttendanceSchema)

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
    /* ---------- GET ---------- */
    if (req.method === 'GET') {
      const date = qp(req.query.date)
      const userPin = qp(req.query.userPin)

      const query: any = {}
      if (date) query.date = date
      if (userPin) query.userPin = userPin

      const records = await Attendance.find(query).lean()

      return res.status(200).json(
        records.map((r: any) => ({ ...r, id: r._id.toString() }))
      )
    }

    /* ---------- POST ---------- */
    if (req.method === 'POST') {
      const body = req.body

      if (!body.date || !body.userId || !body.userName || !body.userPin) {
        return res.status(400).json({ message: 'Missing fields' })
      }

      const exists = await Attendance.findOne({
        date: body.date,
        userPin: body.userPin,
      } as any)

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

    /* ---------- PUT ---------- */
    if (req.method === 'PUT') {
      const id = qp(req.query.id)
      if (!id) return res.status(400).json({ message: 'id required' })

      const updated = await Attendance.findByIdAndUpdate(
        id,
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

    /* ---------- DELETE ---------- */
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
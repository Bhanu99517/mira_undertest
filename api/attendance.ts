
// api/attendance.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Schema, model, models } from 'mongoose'
import dbConnect from './lib/dbConnect'

/* =========================
   Attendance Schema & Model
========================= */

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
  createdAt?: Date
  updatedAt?: Date
}

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
       GET /api/attendance
       - ?date=YYYY-MM-DD
       - ?userPin=1234
    ========================= */

    if (req.method === 'GET') {
      const date = getQueryParam(req.query.date)
      const userPin = getQueryParam(req.query.userPin)

      const query: Record<string, any> = {}
      if (date) query.date = date
      if (userPin) query.userPin = userPin

      const records = await Attendance.find(query)
        .sort({ createdAt: -1 })
        .lean()

      const formatted = records.map((r) => ({
        ...r,
        id: r._id.toString(),
      }))

      return res.status(200).json(formatted)
    }

    /* =========================
       POST /api/attendance
       - Mark attendance
    ========================= */

    if (req.method === 'POST') {
      const {
        date,
        userId,
        userName,
        userPin,
        status,
        userAvatar,
        location,
      } = req.body

      if (!date || !userId || !userName || !userPin || !status) {
        return res.status(400).json({
          message:
            'date, userId, userName, userPin and status are required',
        })
      }

      // Prevent duplicate attendance for same user on same day
      const existing = await Attendance.findOne({
        date,
        userPin,
      })

      if (existing) {
        return res.status(409).json({
          message: 'Attendance already marked for this user today',
        })
      }

      const attendance = await Attendance.create({
        date,
        userId,
        userName,
        userPin,
        status,
        userAvatar,
        timestamp: new Date().toISOString(),
        location,
      })

      return res.status(201).json({
        ...attendance.toObject(),
        id: attendance._id.toString(),
      })
    }

    /* =========================
       PUT /api/attendance
       - Update attendance by id
       - ?id=<attendanceId>
    ========================= */

    if (req.method === 'PUT') {
      const id = getQueryParam(req.query.id)

      if (!id) {
        return res.status(400).json({ message: 'id is required' })
      }

      const updated = await Attendance.findByIdAndUpdate(
        id,
        req.body,
        { new: true }
      ).lean()

      if (!updated) {
        return res.status(404).json({ message: 'Attendance not found' })
      }

      return res.status(200).json({
        ...updated,
        id: updated._id.toString(),
      })
    }

    /* =========================
       DELETE /api/attendance
       - Delete by id
       - ?id=<attendanceId>
    ========================= */

    if (req.method === 'DELETE') {
      const id = getQueryParam(req.query.id)

      if (!id) {
        return res.status(400).json({ message: 'id is required' })
      }

      const deleted = await Attendance.findByIdAndDelete(id).lean()

      if (!deleted) {
        return res.status(404).json({ message: 'Attendance not found' })
      }

      return res.status(200).json({
        message: 'Attendance deleted successfully',
        id: deleted._id.toString(),
      })
    }

    /* =========================
       Method Not Allowed
    ========================= */

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error) {
    console.error('Attendance API error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
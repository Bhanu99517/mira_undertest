
import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../src/lib/dbConnect';
import Attendance from '../src/models/Attendance';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await dbConnect();

  if (req.method === 'GET') {
    const { date, userId, startDate, endDate } = req.query;
    let query: any = {};

    if (date) query.date = date;
    if (userId) query.userId = userId;
    if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
    }

    try {
      const records = await Attendance.find(query).sort({ createdAt: -1 });
      const formatted = records.map(r => {
        const obj = r.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        return obj;
      });
      return res.status(200).json(formatted);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch attendance' });
    }
  }

  if (req.method === 'POST') {
    try {
      const newRecord = await Attendance.create(req.body);
      const obj = newRecord.toObject();
      obj.id = obj._id.toString();
      return res.status(201).json(obj);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

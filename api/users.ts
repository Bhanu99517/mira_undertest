
import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../src/lib/dbConnect';
import User from '../src/models/User';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await dbConnect();

  // Login Route (via Query Params)
  if (req.method === 'GET' && req.query.action === 'login') {
    const { pin, password } = req.query;
    try {
      const user = await User.findOne({ 
        pin: (pin as string).toUpperCase(), 
        password 
      });
      
      if (!user) return res.status(401).json(null);
      
      // Map _id to id for frontend compatibility
      const userData = user.toObject();
      userData.id = userData._id.toString();
      delete userData._id;
      delete userData.__v;
      
      return res.status(200).json(userData);
    } catch (error) {
      return res.status(500).json({ error: 'Login failed' });
    }
  }

  // Get All Users
  if (req.method === 'GET') {
    try {
      const users = await User.find().sort({ createdAt: -1 });
      const formattedUsers = users.map(u => {
        const obj = u.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      return res.status(200).json(formattedUsers);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // Create User
  if (req.method === 'POST') {
    try {
      const newUser = await User.create(req.body);
      const obj = newUser.toObject();
      obj.id = obj._id.toString();
      return res.status(201).json(obj);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // Update User
  if (req.method === 'PUT') {
    const { id } = req.query;
    try {
        // Since frontend sends 'id' but mongo needs '_id'
        const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedUser) return res.status(404).json({ error: "User not found" });
        const obj = updatedUser.toObject();
        obj.id = obj._id.toString();
        return res.status(200).json(obj);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

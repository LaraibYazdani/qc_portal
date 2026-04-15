import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { UserResponse } from '../models/User';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req: express.Request, res: express.Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    ) as [any[], any];

    const users: UserResponse[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      created_at: row.created_at
    }));

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, requireRole(['admin']), [
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['sales', 'admin']).withMessage('Role must be sales or admin')
], async (req: express.Request, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    // Check if email already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as [any[], any];

    if (existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [insertResult] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    ) as [any[], any];

    res.json({ 
      success: true, 
      message: 'User created successfully',
      data: { id: insertResult.insertId }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('role').optional().isIn(['sales', 'admin']).withMessage('Role must be sales or admin')
], async (req: express.Request, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { name, email, role } = req.body;

    // Get existing user
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    ) as [any[], any];

    if (existingUsers.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if email already exists (if changing email)
    if (email && email !== existingUsers[0].email) {
      const [emailCheck] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      ) as [any[], any];

      if (emailCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
    }

    // Update user
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (role !== undefined) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updateValues.push(userId);

    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    ) as [any[], any];

    if (existingUsers.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user has jobs
    const [userJobs] = await pool.execute(
      'SELECT COUNT(*) as count FROM jobs WHERE uploaded_by = ?',
      [userId]
    ) as [any[], any];

    if (userJobs[0].count > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete user with existing jobs' });
    }

    // Delete user
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router as userRoutes };

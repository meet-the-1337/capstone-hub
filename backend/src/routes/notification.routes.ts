import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Unread count endpoints
router.get('/unread-count', NotificationController.getUnreadCount);
router.get('/unread/count', NotificationController.getUnreadCount);

// Bulk mark-all-as-read endpoints
router.post('/mark-all-read', NotificationController.markAllAsRead);
router.post('/read-all', NotificationController.markAllAsRead);
router.patch('/mark-all-read', NotificationController.markAllAsRead);
router.put('/mark-all-read', NotificationController.markAllAsRead);

// Collection endpoints
router.get('/', NotificationController.getUserNotifications);
router.post('/', NotificationController.createNotification);

// Single notification read / unread endpoints
router.patch('/:id/read', NotificationController.markAsRead);
router.put('/:id/read', NotificationController.markAsRead);
router.patch('/:id/unread', NotificationController.markAsUnread);
router.put('/:id/unread', NotificationController.markAsUnread);

// Individual notification item endpoints
router.get('/:id', NotificationController.getNotificationById);
router.delete('/:id', NotificationController.deleteNotification);

export default router;

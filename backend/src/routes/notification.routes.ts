import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', NotificationController.getUserNotifications);
router.post('/', NotificationController.createNotification);
router.get('/:id', NotificationController.getNotificationById);
router.delete('/:id', NotificationController.deleteNotification);

export default router;

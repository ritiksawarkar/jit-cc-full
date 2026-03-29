# 📬 Real-Time Notification System Guide

## Overview

Your application now has a comprehensive real-time notification system for students! Students can receive and manage notifications about:

- **Events**: New events, event problems, event updates
- **Account**: Account freeze, password reset, profile changes
- **Submissions**: Submission results, score updates
- **Problems**: Problem statement updates
- **Certificates**: Certificate issued, certificate verified
- **Admin Messages**: Direct messages from administrators

---

## 🎯 Key Features

✅ **Real-Time Updates**: Notifications poll every 10 seconds  
✅ **Badge Notifications**: Unread count badge in TopBar  
✅ **Critical Alerts**: Pulsing notifications for critical messages  
✅ **Full Management Page**: View, filter, sort, and manage all notifications  
✅ **Bulk Actions**: Mark multiple as read, archive in bulk  
✅ **Priority Levels**: critical, high, normal, low  
✅ **Smart Filtering**: By type, priority, read status  
✅ **Fast Route Handler**: Optimized polling with 10-second intervals

---

## 📱 Frontend Components

### 1. **Notification Badge** (TopBar)

- **Location**: `client/src/components/NotificationBadge.jsx`
- **Features**:
  - Shows unread count
  - Displays recent critical notifications
  - Dropdown preview of latest 5 notifications
  - Link to full notifications page

```jsx
import NotificationBadge from "../components/NotificationBadge";

<NotificationBadge />; // Add to TopBar or any navigation
```

### 2. **Notification Center** (Modal/Card)

- **Location**: `client/src/components/NotificationCenter.jsx`
- **Features**:
  - Display recent notifications (up to 20)
  - Quick filters (all, unread, critical)
  - Inline actions (read, pin, archive, delete)
  - Action buttons for CTA links

```jsx
import NotificationCenter from "../components/NotificationCenter";

<NotificationCenter />; // Can be used in dashboard or sidebar
```

### 3. **Full Notifications Page**

- **Location**: `client/src/pages/NotificationsPage.jsx`
- **Route**: `/notifications`
- **Features**:
  - Display all notifications
  - Multiple filter options (all, unread, critical, by type)
  - Sort options (newest, oldest, unread-first)
  - Bulk selection and actions
  - Archive all read notifications

### 4. **useNotifications Hook**

- **Location**: `client/src/hooks/useNotifications.js`
- **Features**:
  - Auto-polling notifications every 10 seconds
  - Returns notifications, summary, and helper methods
  - Show toast for critical notifications

```jsx
import { useNotifications } from "../hooks/useNotifications";

const {
  notifications, // Array of all notifications
  summary, // { unreadCount, critical, unreadByType, lastPinned }
  isLoading,
  error,
  fetchNotifications, // Manual fetch
  fetchNotificationSummary,
  getUnreadCountByType,
  getNotificationsByType,
  getCriticalNotifications,
  getPinnedNotifications,
} = useNotifications(pollingInterval);
```

---

## 🔧 Backend API Endpoints

### Student Endpoints

```bash
# Get student's notifications
GET /api/notifications
  Query params: type, isRead, priority, limit, skip

# Get notification summary (badge counts)
GET /api/notifications/summary

# Mark single notification as read
PUT /api/notifications/:notificationId/read

# Mark multiple as read
PUT /api/notifications/read-all
  Body: { notificationIds: ["id1", "id2"] }

# Archive a notification
PUT /api/notifications/:notificationId/archive

# Archive all read notifications
PUT /api/notifications/archive-all

# Delete notification
DELETE /api/notifications/:notificationId

# Pin notification
PUT /api/notifications/:notificationId/pin
```

### Admin Endpoints

```bash
# Send notification to student(s)
POST /api/notifications/create
  Body: {
    userId: "student_id",          // OR userIds: ["id1", "id2"]
    type: "event|account|submission|admin_message|problem|certificate|system",
    title: "Notification Title",
    message: "Main notification message",
    description: "Optional longer description",
    eventId: "event_id",           // Optional
    problemId: "problem_id",       // Optional
    priority: "critical|high|normal|low",
    actionUrl: "/compiler",        // Optional CTA link
    actionLabel: "Go to Compiler", // Optional button text
    metadata: {}                   // Optional custom data
  }

# Get all notifications (admin debug)
GET /admin/all?userId=X&type=Y&isRead=Z
```

---

## 📨 How to Send Notifications

### From Backend (Node.js)

```javascript
import Notification from "../models/Notification.js";

// Single notification
async function notifyStudent(userId, payload) {
  const notification = await Notification.create({
    userId,
    type: "event",
    title: "New Event Available",
    message: "A new coding competition is now open for registration",
    description: "The Spring 2024 Coding Challenge is now live...",
    eventId: eventId,
    priority: "high",
    actionUrl: "/events",
    actionLabel: "View Event",
  });
  return notification;
}

// Bulk notifications (all students in an event)
async function notifyEventParticipants(eventId, payload) {
  const participants = await EventAttendance.find({ eventId }).distinct(
    "userId",
  );

  const notifications = participants.map((userId) => ({
    userId,
    ...payload,
    eventId,
  }));

  return await Notification.insertMany(notifications);
}

// Example: Notify on account freeze
async function notifyAccountFreeze(userId, reason) {
  return await Notification.create({
    userId,
    type: "account",
    title: "Account Frozen",
    message: `Your account has been frozen by administrator`,
    description: reason,
    priority: "critical",
    actionUrl: "/dashboard",
    actionLabel: "View Account",
  });
}

// Example: Notify on submission result
async function notifySubmissionResult(userId, submissionId, passed) {
  return await Notification.create({
    userId,
    type: "submission",
    title: passed ? "✅ Submission Passed!" : "❌ Submission Failed",
    message: passed
      ? "All test cases passed!"
      : "Some test cases failed. Review and try again.",
    submissionId,
    priority: passed ? "high" : "normal",
    actionUrl: "/compiler",
    actionLabel: "View Results",
  });
}

// Example: Notify certificate issued
async function notifyNewCertificate(userId, certificateId, eventTitle) {
  return await Notification.create({
    userId,
    type: "certificate",
    title: `Certificate Issued: ${eventTitle}`,
    message: "Your certificate has been generated and is ready to download",
    certificateId,
    priority: "high",
    actionUrl: "/dashboard#certificates",
    actionLabel: "Download Certificate",
  });
}

// Example: Admin message
async function sendAdminMessage(userId, subject, message, senderId) {
  return await Notification.create({
    userId,
    type: "admin_message",
    title: subject,
    message,
    senderId,
    priority: "high",
  });
}

export {
  notifyStudent,
  notifyEventParticipants,
  notifyAccountFreeze,
  notifySubmissionResult,
  notifyNewCertificate,
  sendAdminMessage,
};
```

### From Admin UI (Frontend)

```jsx
import { createNotification } from "../services/api";

// Send notification via API
const handleSendNotification = async () => {
  try {
    const result = await createNotification({
      userIds: selectedStudentIds,
      type: "account",
      title: "Important Announcement",
      message: "Please update your profile information",
      description: "This is required for certificate generation",
      priority: "high",
      metadata: { requiresAction: true },
    });

    showToast("Notification sent successfully!");
    console.log("Created:", result.count, "notifications");
  } catch (err) {
    showToast("Failed to send notification", "error");
  }
};
```

---

## 🎨 Notification Types & Examples

### Event Notifications

```javascript
{
  type: "event",
  title: "Event Started",
  message: "Spring 2024 Coding Challenge has started!",
  eventId: "event_123",
  priority: "high",
  actionUrl: "/compiler?eventId=event_123",
  actionLabel: "Start Competing",
}
```

### Account Notifications

```javascript
{
  type: "account",
  title: "Account Frozen",
  message: "Your account has been suspended",
  description: "Reason: Multiple rule violations detected",
  priority: "critical",
  actionUrl: "/dashboard",
  actionLabel: "Review",
}
```

### Submission Notifications

```javascript
{
  type: "submission",
  title: "All Tests Passed! 🎉",
  message: "Your submission scored 100/100",
  submissionId: "sub_456",
  priority: "high",
  actionUrl: "/compiler",
  actionLabel: "View Details",
}
```

### Problem Notifications

```javascript
{
  type: "problem",
  title: "Problem Statement Updated",
  message: "The problem description has been clarified",
  problemId: "problem_789",
  priority: "normal",
  actionUrl: "/compiler",
  actionLabel: "View Problem",
}
```

### Certificate Notifications

```javascript
{
  type: "certificate",
  title: "Certificate Ready",
  message: "Your certificate is now available for download",
  certificateId: "cert_101",
  priority: "high",
  actionUrl: "/dashboard",
  actionLabel: "Download",
}
```

### Admin Message

```javascript
{
  type: "admin_message",
  title: "Security Alert",
  message: "Unusual activity detected on your account",
  senderId: "admin_user_id",
  priority: "critical",
  actionUrl: "/dashboard",
}
```

---

## 🔄 Triggering Notifications Automatically

### Integration Points (Add These to Existing Controllers)

**In `submissionController.js`:**

```javascript
import { notifySubmissionResult } from "../services/notificationService.js";

async function handleSubmissionResult(userId, submissionId, passed) {
  // ... existing submission logic ...

  // Notify student of result
  await notifySubmissionResult(userId, submissionId, passed);
}
```

**In `adminController.js`:**

```javascript
import { notifyAccountFreeze } from "../services/notificationService.js";

async function freezeStudentAccount(userId, reason) {
  // ... freeze logic ...

  // Notify student
  await notifyAccountFreeze(userId, reason);
}
```

**In `certificateController.js`:**

```javascript
import { notifyNewCertificate } from "../services/notificationService.js";

async function issueCertificates(eventId) {
  // ... certificate generation logic ...

  // Notify each student
  for (const student of students) {
    await notifyNewCertificate(student.userId, cert.id, event.title);
  }
}
```

---

## 📊 Database Schema

**Notification Collection:**

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),      // Recipient
  type: "system|event|account|...",
  title: String,                     // Max 100 chars
  message: String,                   // Max 500 chars
  description: String,               // Max 2000 chars (optional)
  eventId: ObjectId (optional),
  problemId: ObjectId (optional),
  submissionId: ObjectId (optional),
  certificateId: ObjectId (optional),
  senderId: ObjectId (optional),     // For admin messages
  priority: "low|normal|high|critical",
  actionUrl: String (optional),      // CTA link
  actionLabel: String (optional),    // Button text
  isRead: Boolean,
  readAt: Date (optional),
  isPinned: Boolean,
  isArchived: Boolean,
  metadata: Object (optional),
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
- userId + isRead + isArchived
- userId + createdAt (DESC)
- userId + type
- userId + priority
```

---

## 🚀 Usage Summary

### For Students:

1. **Toggle Badge**: Click bell icon in TopBar for quick preview
2. **View All**: Click "View All" or navigate to `/notifications`
3. **Filter**: By type, priority, read status
4. **Manage**: Mark read, pin, archive, delete

### For Admins:

1. **Send Bulk**: Post to `/api/notifications/create` with list of users
2. **Monitor**: GET `/api/notifications/admin/all` for debugging
3. **Trigger Auto**: Call helper functions when events occur (submissions, freezes, certificates)

### For Developers:

1. **Import Hook**: `useNotifications()` in any component
2. **Call APIs**: Use functions from `services/api.js`
3. **Create Notifications**: Use helper functions in `controllers/notificationController.js`
4. **Add Integrations**: Trigger notifications in existing event handlers

---

## ✅ Checklist

- [x] Notification Model created
- [x] API Routes with authentication/authorization
- [x] Frontend components (Badge, Center, Page)
- [x] Real-time polling hook
- [x] Student notification management
- [x] Admin notification creation
- [x] TopBar integration
- [x] Route in App.jsx
- [ ] **TODO**: Integrate with existing controllers (submission, admin, certificate)
- [ ] **TODO**: Test on production environment
- [ ] **TODO**: Add WebSocket support for instant updates (optional)
- [ ] **TODO**: Create admin UI for sending notifications

---

## 🎯 Next Steps

1. **Update Submission Controller**: Call `notifySubmissionResult()` when submitting code
2. **Update Admin Controller**: Call `notifyAccountFreeze()` when freezing accounts
3. **Update Certificate Controller**: Call `notifyNewCertificate()` when issuing certificates
4. **Create Admin Notification UI**: Add form to admin dashboard for sending notifications
5. **(Optional) Add WebSocket**: Replace polling with real-time WebSocket updates

---

## 📞 Questions?

- Check `server/models/Notification.js` for schema
- Check `server/controllers/notificationController.js` for API logic
- Check `client/src/hooks/useNotifications.js` for frontend polling logic
- Check example payloads above for notification structure

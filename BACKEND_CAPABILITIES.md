# Backend Capabilities Analysis

## Overview
This is a comprehensive Node.js/Express backend API for a multi-role distribution management system. The backend supports Admin, Stalkist, Dealer (Dellear), and Salesman roles with extensive features for inventory, sales, payments, analytics, and more.

## Technology Stack
- **Runtime**: Node.js with Express.js
- **Database**: MongoDB (MongoDB Atlas) with dual database architecture
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **File Storage**: Cloudinary for image uploads
- **PDF Generation**: PDFKit for invoice/bill generation
- **Caching**: In-memory caching middleware for performance optimization
- **Internationalization**: Multi-language support (English, Gujarati)

---

## Core Features & Capabilities

### 1. Authentication & Authorization
- **JWT-based authentication** with 7-day token expiration
- **Role-based access control** (RBAC):
  - Admin: Full system access
  - Stalkist: Can register Dealers
  - Dealer (Dellear): Can register Salesmen, manage own operations
  - Salesman: Can manage shopkeepers and sales
- **Hierarchical user registration**:
  - Admin → Any role
  - Stalkist → Dealer only
  - Dealer → Salesman only
- **Password security**: bcrypt hashing with salt rounds

### 2. Product Management
- **CRUD operations** for products
- **Multi-language product titles** (English, Gujarati)
- **Stock management** (in strips)
- **Pricing**: Packet price, initial packet price, packets per strip
- **Product images** via Cloudinary
- **Stock validation** before order approval
- **Product search and filtering**

### 3. Dealer Request Management
- **Request lifecycle**:
  - Create request (Dealer)
  - Upload payment receipt (Dealer)
  - Verify payment (Admin)
  - Approve/Reject request (Admin)
  - Send bill (Admin)
  - Cancel request (Admin)
- **Payment handling**:
  - Full payment
  - Partial payment
  - Outstanding amount tracking
  - Payment verification with receipt upload
  - Payment rejection with notes
- **Bill generation**:
  - PDF invoice generation
  - E-waybill integration
  - Grouped order billing
  - Invoice snapshot storage
- **Stock deduction** on approval
- **Dealer stock allocation** on approval

### 4. Sales Management
- **Sales recording** (Salesman)
- **Sales tracking** with product, quantity, price
- **Bill generation** for sales
- **Bill approval workflow**:
  - Pending bills
  - Approved bills
  - Rejected bills
- **Sales targets**:
  - Set targets for salesmen
  - Track performance against targets
- **Commission calculation**:
  - Automatic commission calculation
  - Commission status management
  - Commission approval workflow

### 5. Stock Management
- **Multi-level stock allocation**:
  - Admin → Dealer
  - Dealer → Salesman
- **Stock tracking**:
  - Total strips
  - Allocated strips
  - Available strips
- **Stock alerts** for low inventory
- **Stock movement tracking**
- **Location-based stock allocation**

### 6. Financial Management
- **Payment tracking**:
  - Payment history
  - Payment status (pending, completed, reconciled)
  - Payment methods (cash, UPI, credit)
  - Receipt image uploads
- **Outstanding amount tracking**
- **Payment reconciliation**:
  - Single payment reconciliation
  - Bulk reconciliation
- **Dealer credit management**:
  - Credit limits
  - Credit usage tracking
  - Credit adjustments
- **Refund management**
- **UPI transaction tracking**
- **Payment reminders**

### 7. Analytics & Reporting
- **Revenue analytics**:
  - Revenue trends (daily, weekly, monthly, yearly)
  - Revenue by dealer
  - Revenue by product
  - Revenue by location
- **Product performance**:
  - Top products
  - Product sales trends
  - Revenue distribution
- **Dealer performance**:
  - Sales statistics
  - Payment status
  - Performance metrics
- **Salesman performance**:
  - Sales tracking
  - Target achievement
  - Commission earnings
- **Stock movement analytics**
- **Location-based analytics**
- **Data export** capabilities
- **Caching** for performance (1-5 minute TTL based on data type)

### 8. Dealer Analytics (Dealer-specific)
- **Performance dashboard**:
  - Sales performance
  - Revenue trends
  - Top products
  - Salesman performance
  - Payment status overview
  - Stock alerts
- **Cached queries** for fast dashboard loading

### 9. Messaging System
- **Admin-to-user messaging**:
  - Send messages to specific roles
  - Send to all users
  - Send to specific recipients
  - Image attachments
- **Message read tracking**
- **Sent messages history**
- **Recipient management**

### 10. User Management
- **Admin user management**:
  - View all users
  - Filter by role
  - User statistics
- **Dealer management**:
  - View dealers
  - Dealer statistics
  - Salesmen under dealers
- **Salesman management**:
  - View salesmen
  - Performance tracking

### 11. Location Management
- **Location allocation**:
  - Admin allocates locations to dealers
  - Dealers allocate locations to salesmen
- **Location-based analytics**
- **Gujarat districts data** integration

### 12. Shopkeeper Management (Salesman)
- **CRUD operations** for shopkeepers
- **Shopkeeper sales tracking**
- **Shopkeeper performance**

### 13. Dealer Profile & Documents
- **Dealer profile management**
- **Document uploads**:
  - Document storage
  - Document verification
  - Document types

### 14. Archive System
- **Dual database architecture**:
  - Main database: Active records
  - Archive database: Historical records (>2 years old)
- **Automatic archiving**:
  - Sales records
  - Payment records
  - Dealer request records
- **Unified querying**:
  - Seamless queries across both databases
  - Automatic routing based on date ranges
- **Performance optimization**:
  - Reduces main database size
  - Faster queries on active data
  - Cost-effective storage for historical data

### 15. Advanced Features
- **Multi-language support**:
  - English
  - Gujarati
  - Language detection from headers
  - Translated error messages
- **File uploads**:
  - Image uploads (receipts, product images, messages)
  - Cloudinary integration
  - File size limits (5MB)
  - File type validation
- **PDF generation**:
  - Invoice generation
  - Bill generation
  - Custom formatting
- **Caching middleware**:
  - Route-level caching
  - Configurable TTL
  - Cache invalidation
  - Performance optimization
- **Database connection pooling**:
  - Connection pool management
  - Health monitoring
  - Automatic reconnection
  - Connection statistics

---

## API Endpoints Summary

### Authentication (`/api/auth`)
- `POST /register` - Register new user (role-based)
- `POST /login` - User login
- `GET /verify` - Verify JWT token
- `GET /me` - Get current user

### Products (`/api/products`)
- `POST /` - Create product (Admin)
- `GET /` - Get products (paginated, searchable)
- `GET /:id` - Get product by ID
- `PUT /:id` - Update product (Admin)
- `DELETE /:id` - Delete product (Admin)

### Dealer Requests (`/api/dealer-requests`)
- `POST /` - Create request (Dealer)
- `GET /` - Get requests (filtered, paginated)
- `GET /:id` - Get request by ID
- `PUT /:id/upload-receipt` - Upload payment receipt (Dealer)
- `PUT /:id/verify-payment` - Verify payment (Admin)
- `PUT /:id/reject-payment` - Reject payment (Admin)
- `PUT /:id/approve` - Approve request (Admin)
- `PUT /:id/cancel` - Cancel request (Admin)
- `PUT /:id/send-bill` - Send bill (Admin)
- `PUT /:id/send-bill/grouped` - Send grouped bill (Admin)
- `GET /:id/bill` - Get bill PDF (Admin)
- `POST /:id/ewaybill` - Generate e-waybill (Admin)
- `GET /:id/ewaybill` - Get e-waybill
- `POST /:id/ewaybill/cancel` - Cancel e-waybill (Admin)
- `GET /upi-id` - Get UPI ID
- `PUT /upi-id` - Update UPI ID (Admin)

### Sales (`/api/sales`)
- `POST /` - Create sale (Salesman)
- `GET /` - Get sales (filtered, paginated)
- `GET /:id` - Get sale by ID
- `PUT /:id` - Update sale
- `DELETE /:id` - Delete sale
- `POST /bill` - Generate bill (Salesman)
- `GET /reports/summary` - Sales report summary
- `POST /targets` - Create sales target (Dealer)
- `GET /targets` - Get sales targets
- `PUT /targets/:id` - Update sales target (Dealer)
- `POST /commissions/calculate` - Calculate commissions (Dealer)
- `GET /commissions` - Get commissions
- `PUT /commissions/:id/status` - Update commission status (Dealer)
- `GET /bills/pending` - Get pending bills (Dealer)
- `GET /bills/approved` - Get approved bills (Dealer)
- `PUT /bills/:invoiceNo/approve` - Approve bill (Dealer)
- `PUT /bills/:invoiceNo/reject` - Reject bill (Dealer)
- `PUT /bills/:invoiceNo/save-pdf` - Save bill PDF

### Analytics (`/api/analytics`)
- `GET /revenue` - Revenue analytics (Admin)
- `GET /products` - Product performance (Admin)
- `GET /dealers` - Dealer performance (Admin)
- `GET /salesmen` - Salesman performance (Admin)
- `GET /stock-movement` - Stock movement analytics (Admin)
- `GET /locations` - Location analytics (Admin)
- `GET /export` - Export analytics data (Admin)

### Dealer Analytics (`/api/analytics/dealer`)
- `GET /performance` - Dealer performance dashboard
- `GET /revenue-trends` - Revenue trends
- `GET /top-products` - Top products
- `GET /salesman-performance` - Salesman performance
- `GET /payment-status` - Payment status overview
- `GET /stock-alerts` - Stock alerts

### Financial (`/api/financial`)
- `GET /payments` - Get payment history
- `GET /payments/:id` - Get payment by ID
- `POST /payments` - Create payment
- `PUT /payments/:id/status` - Update payment status (Admin)
- `GET /outstanding` - Get outstanding amounts (Admin)
- `PUT /payments/:id/reconcile` - Reconcile payment (Admin)
- `POST /payments/reconcile-bulk` - Bulk reconciliation (Admin)
- `GET /upi-transactions` - Get UPI transactions
- `POST /refunds` - Create refund (Admin)
- `GET /refunds` - Get refunds
- `GET /credits` - Get dealer credits (Admin)
- `GET /credits/my` - Get my credits
- `PUT /credits/:dealerId` - Update dealer credit (Admin)
- `GET /reminders` - Get payment reminders (Admin)

### Messages (`/api/messages`)
- `POST /` - Create message (Admin)
- `GET /` - Get messages
- `GET /sent` - Get sent messages (Admin)
- `PUT /:id/read` - Mark message as read
- `GET /recipients` - Get recipients (Admin)

### Stock Allocation (`/api/stock-allocation`)
- `GET /dealer/stock` - Get dealer stock (Dealer)
- `GET /dealer/salesmen` - Get salesmen for allocation (Dealer)
- `POST /allocate` - Allocate stock (Dealer)
- `GET /dealer/allocations` - Get dealer allocations (Dealer)
- `GET /salesman/dealer-stock` - Get dealer stock (Salesman)
- `GET /salesman/stock` - Get salesman stock (Salesman)

### Location Allocation (`/api/location-allocation`)
- `POST /admin/allocate-to-dealer` - Allocate location to dealer (Admin)
- `GET /admin/dealer/:dealerId/allocations` - Get dealer allocations (Admin)
- `GET /admin/dealers-allocations` - Get all dealer allocations (Admin)
- `DELETE /admin/allocation/:allocationId` - Delete allocation (Admin)
- `GET /dealer/my-allocations` - Get my allocations (Dealer)
- `POST /dealer/allocate-to-salesman` - Allocate location to salesman (Dealer)
- `GET /dealer/salesman/:salesmanId/allocations` - Get salesman allocations (Dealer)
- `GET /dealer/salesmen-allocations` - Get all salesman allocations (Dealer)
- `DELETE /dealer/allocation/:allocationId` - Delete allocation (Dealer)
- `GET /salesman/my-allocations` - Get my allocations (Salesman)

### Shopkeepers (`/api/shopkeepers`)
- `POST /` - Create shopkeeper (Salesman)
- `GET /` - Get shopkeepers (Salesman)
- `GET /:id` - Get shopkeeper by ID (Salesman)
- `PUT /:id` - Update shopkeeper (Salesman)
- `DELETE /:id` - Delete shopkeeper (Salesman)

### Admin Dealers (`/api/admin/dealers`)
- `GET /` - Get all dealers (Admin)
- `GET /:dealerId/salesmen` - Get dealer's salesmen (Admin)

### Admin Users (`/api/admin/users`)
- User management endpoints (Admin)

### Dealers (`/api/dealers`)
- `GET /` - Get dealers (Stalkist)

### Stalkists (`/api/stalkists`)
- Stalkist management endpoints

### Locations (`/api/locations`)
- Location management endpoints

### Dealer Profile (`/api/dealer-profile`)
- Dealer profile management

### Dealer Documents (`/api/dealer-documents`)
- Document upload and management

### Upload (`/api/upload`)
- File upload endpoints

---

## Database Models

1. **User** - User accounts with roles
2. **Product** - Product catalog
3. **DealerRequest** - Dealer order requests
4. **DealerStock** - Stock allocated to dealers
5. **StockAllocation** - Stock allocation records
6. **LocationAllocation** - Location allocation records
7. **Sale** - Sales records
8. **Payment** - Payment records
9. **DealerCredit** - Dealer credit management
10. **Commission** - Commission records
11. **SalesTarget** - Sales targets
12. **Message** - System messages
13. **Shopkeeper** - Shopkeeper records
14. **DealerProfile** - Dealer profiles
15. **DealerDocument** - Dealer documents
16. **AdminSettings** - Admin settings
17. **Archive Models**:
    - SaleArchive
    - PaymentArchive
    - DealerRequestArchive

---

## Performance Features

1. **Caching**:
   - Route-level caching
   - Configurable TTL (1-5 minutes)
   - Cache invalidation
   - Performance optimization

2. **Database Optimization**:
   - Connection pooling (max 50, min 5)
   - Indexes on frequently queried fields
   - Archive database for historical data
   - Query optimization

3. **Connection Management**:
   - Health monitoring
   - Automatic reconnection
   - Connection statistics
   - Timeout handling

---

## Security Features

1. **Authentication**:
   - JWT tokens
   - Password hashing (bcrypt)
   - Token expiration

2. **Authorization**:
   - Role-based access control
   - Route-level protection
   - Resource-level permissions

3. **Input Validation**:
   - Request validation
   - File type validation
   - File size limits
   - Data sanitization

4. **CORS Configuration**:
   - Configurable origins
   - Support for Electron, React Native
   - Security headers

---

## Scalability Features

1. **Dual Database Architecture**:
   - Main database for active data
   - Archive database for historical data
   - Automatic data routing

2. **Connection Pooling**:
   - Efficient connection management
   - Scalable to high traffic

3. **Caching**:
   - Reduces database load
   - Faster response times

4. **Modular Architecture**:
   - Route-based organization
   - Reusable middleware
   - Easy to extend

---

## Internationalization

- **Multi-language support**:
  - English (default)
  - Gujarati
  - Language detection from headers
  - Translated error messages
  - Product titles in multiple languages

---

## File Handling

- **Cloudinary Integration**:
  - Image uploads
  - Receipt storage
  - Product images
  - Message attachments

- **PDF Generation**:
  - Invoice generation
  - Bill generation
  - Custom formatting

---

## Summary

This backend is **highly capable** and **production-ready** with:

✅ **100+ API endpoints** covering all business operations
✅ **Multi-role system** with hierarchical permissions
✅ **Comprehensive analytics** and reporting
✅ **Advanced stock management** with multi-level allocation
✅ **Financial management** with payment tracking and reconciliation
✅ **Archive system** for historical data management
✅ **Performance optimization** with caching and connection pooling
✅ **Security features** with JWT and RBAC
✅ **Internationalization** support
✅ **File handling** with Cloudinary and PDF generation
✅ **Scalable architecture** with dual database support

The backend is well-structured, follows best practices, and is ready for production deployment.


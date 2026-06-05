import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: String,
  pages: { type: Number, default: 1 },
  copies: { type: Number, default: 1, min: 1 },
  colorMode: { type: String, enum: ['black_white', 'color'], default: 'black_white' },
  paperSize: { type: String, enum: ['A4', 'A3', 'Letter'], default: 'A4' },
  doubleSided: { type: Boolean, default: false },
  binding: { type: String, enum: ['none', 'staple', 'spiral'], default: 'none' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    default: () => `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  },
  student: {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    matricNumber: { type: String, trim: true },
  },
  files: { type: [fileSchema], validate: v => v.length > 0 },
  pricing: {
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    breakdown: mongoose.Schema.Types.Mixed,
  },
  pickupLocation: { type: String, default: 'Main Library' },
  specialInstructions: String,
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'printing', 'ready', 'collected', 'cancelled'],
    default: 'pending',
  },
  payment: {
    status: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    method: { type: String, enum: ['paystack', 'cash', 'transfer'], default: 'paystack' },
    paystackReference: String,
    paidAt: Date,
  },
  adminNotes: String,
  estimatedReadyAt: Date,
}, { timestamps: true });

orderSchema.index({ 'student.email': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);

import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  active: { type: Boolean, default: true },
  totalPagesReferred: { type: Number, default: 0 },
  totalEarnings:      { type: Number, default: 0 },
  paidOut:            { type: Number, default: 0 },
  ordersReferred:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
}, { timestamps: true });

referralSchema.virtual('pendingPayout').get(function () {
  return this.totalEarnings - this.paidOut;
});

export default mongoose.model('Referral', referralSchema);

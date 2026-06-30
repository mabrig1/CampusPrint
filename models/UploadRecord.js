import mongoose from 'mongoose';

const uploadRecordSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedKey:    { type: String, required: true },   // S3 key or disk filename
  storageType:  { type: String, enum: ['s3', 'disk'], required: true },
  mimeType:     String,
  size:         Number,
  pageCount:    Number,                              // auto-detected for PDFs
  studentEmail: { type: String, lowercase: true, trim: true },
  status:       { type: String, enum: ['active', 'deleted'], default: 'active' },
  orderId:      String,
}, { timestamps: true });

uploadRecordSchema.index({ studentEmail: 1, createdAt: -1 });
uploadRecordSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('UploadRecord', uploadRecordSchema);

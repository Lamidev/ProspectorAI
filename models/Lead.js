const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    enum: ['Google Maps', 'Instagram', 'Facebook', 'TikTok', 'Yelp', 'LinkedIn', 'TripAdvisor', 'Manual'],
    default: 'Google Maps'
  },
  niche: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  socialUrl: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    default: 0
  },
  reviewsCount: {
    type: Number,
    default: 0
  },
  bioSnippet: {
    type: String,
    default: ''
  },
  websiteStatus: {
    type: String,
    default: ''
  },
  bottlenecks: {
    type: [String],
    default: []
  },
  convertibility: {
    type: String,
    default: ''
  },
  qualityScore: {
    type: Number,
    default: 0
  },
  customPitch: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['scraped', 'pitch-ready', 'contacted', 'interested', 'closed', 'rejected'],
    default: 'scraped'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Avoid duplicate leads in the same niche/location
LeadSchema.index({ name: 1, location: 1, niche: 1 }, { unique: true });

module.exports = mongoose.model('Lead', LeadSchema);

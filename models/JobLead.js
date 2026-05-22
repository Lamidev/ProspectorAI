const mongoose = require('mongoose');

const JobLeadSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    default: 'Reddit'
  },
  postUrl: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  postContent: {
    type: String,
    default: '',
    trim: true
  },
  budget: {
    type: String,
    default: 'Unspecified'
  },
  requiredSkills: {
    type: [String],
    default: []
  },
  customProposal: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['scraped', 'proposal-ready', 'applied', 'closed'],
    default: 'scraped'
  },
  postCreatedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('JobLead', JobLeadSchema);

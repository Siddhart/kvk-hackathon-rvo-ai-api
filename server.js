#!/usr/bin/env node

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { RVOAgentAIAutonomous } from './agent-ai-autonomous.js'

// Load environment variables from .env file
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'RVO Agent API is running',
    timestamp: new Date().toISOString()
  })
})

// Main analysis endpoint
app.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body
    
    // Validate input
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL in the request body'
      })
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'URL must start with http:// or https://'
      })
    }
    
    console.log(`🔍 Analyzing URL: ${url}`)
    
    // Run the analysis
    const agent = new RVOAgentAIAutonomous()
    const result = await agent.analyzeSubsidy(url)
    
    // Check for errors
    if (result.error) {
      return res.status(500).json({
        error: 'Analysis failed',
        message: result.error,
        url: url
      })
    }
    
    // Return clean JSON response
    const response = {
      success: true,
      url: result.url,
      title: result.title,
      analyzed_at: result.analyzed_at,
      pages_analyzed: result.pages_analyzed,
      attestations: result.requirements.attestations || [],
      non_attestations: result.requirements.non_attestations || [],
      analysis_notes: result.requirements.analysis_notes || ''
    }
    
    console.log(`✅ Analysis complete for ${url}: ${response.attestations.length} attestations, ${response.non_attestations.length} non-attestations`)
    
    res.json(response)
    
  } catch (error) {
    console.error('❌ Server error:', error.message)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found. Use POST /analyze to analyze a subsidy URL.'
  })
})

// Start server
app.listen(PORT, () => {
  console.log('🚀 RVO Agent API Server Started!')
  console.log('================================')
  console.log(`📍 Server running on port ${PORT}`)
  console.log(`🌐 Health check: http://localhost:${PORT}/health`)
  console.log(`🔍 Analysis endpoint: POST http://localhost:${PORT}/analyze`)
  console.log('')
  console.log('📝 Usage:')
  console.log('  curl -X POST http://localhost:3000/analyze \\')
  console.log('    -H "Content-Type: application/json" \\')
  console.log('    -d \'{"url": "https://www.rvo.nl/onderwerpen/dhi-subsidieregeling"}\'')
  console.log('')
})

export default app

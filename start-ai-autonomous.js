#!/usr/bin/env node

import dotenv from 'dotenv'
import { RVOAgentAIAutonomous } from "./agent-ai-autonomous.js"

// Load environment variables from .env file
dotenv.config()

/**
 * AI-Autonomous RVO Agent Start Script
 * Usage: node start-ai-autonomous.js <subsidy-url>
 * 
 * This version lets the AI decide what pages to scrape and analyze
 */

async function main() {
  const url = process.argv[2]

  if (!url) {
    console.log('🤖 AI-Autonomous RVO Agent')
    console.log('==========================\n')
    console.log('Usage: node start-ai-autonomous.js <subsidy-url>')
    console.log('')
    console.log('Examples:')
    console.log('  node start-ai-autonomous.js "https://www.rvo.nl/onderwerpen/dhi-subsidieregeling"')
    console.log('  node start-ai-autonomous.js "https://www.rvo.nl/subsidies-financiering/svom"')
    console.log('')
    console.log('Required: Set OPENAI_API_KEY environment variable')
    console.log('  export OPENAI_API_KEY="your-api-key"')
    console.log('')
    console.log('This version lets the AI autonomously:')
    console.log('  1. Analyze the main page')
    console.log('  2. Decide which sub-pages to scrape')
    console.log('  3. Scrape and analyze all relevant pages')
    console.log('  4. Extract and classify requirements intelligently')
    process.exit(1)
  }

  // Validate URL
  if (!url.startsWith('http')) {
    console.error('❌ Error: Please provide a valid URL starting with http:// or https://')
    process.exit(1)
  }

  console.log('🤖 AI-Autonomous RVO Agent Starting...')
  console.log('======================================\n')

  try {
    const agent = new RVOAgentAIAutonomous()
    const result = await agent.analyzeSubsidy(url)

    if (result.error) {
      console.log('❌ Analysis Failed:')
      console.log(`   Error: ${result.error}`)
      process.exit(1)
    }

    console.log('\n✅ AI-Autonomous Analysis Complete!')
    console.log('===================================\n')

    console.log(`📄 Title: ${result.title}`)
    console.log(`🔗 URL: ${result.url}`)
    console.log(`📊 Pages analyzed: ${result.pages_analyzed}`)
    console.log(`⏰ Analyzed at: ${result.analyzed_at}\n`)

    if (result.ai_scraping_plan) {
      console.log('🧠 AI Scraping Plan:')
      console.log('===================')
      console.log(`   Main page: ${result.ai_scraping_plan.main_page.title}`)
      console.log(`   Sub-pages identified: ${result.ai_scraping_plan.sub_pages.length}`)
      console.log(`   Focus keywords: ${result.ai_scraping_plan.focus_keywords.join(', ')}\n`)
    }

    console.log('📋 AI-AUTONOMOUS REQUIREMENTS:')
    console.log('==============================\n')

    if (result.requirements.attestations.length > 0) {
      console.log('📋 Attestations (Documents that prove something):')
      result.requirements.attestations.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req}`)
      })
      console.log('')
    } else {
      console.log('📋 Attestations: None detected\n')
    }

    if (result.requirements.non_attestations.length > 0) {
      console.log('📄 Non-attestations (Documents to be created):')
      result.requirements.non_attestations.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req}`)
      })
      console.log('')
    } else {
      console.log('📄 Non-attestations: None detected\n')
    }

    if (result.requirements.analysis_notes) {
      console.log('💡 AI Analysis Notes:')
      console.log('=====================')
      console.log(`   ${result.requirements.analysis_notes}\n`)
    }

    console.log('📊 AI-AUTONOMOUS SUMMARY:')
    console.log('=========================')
    console.log(`   Total Attestations: ${result.requirements.attestations.length}`)
    console.log(`   Total Non-attestations: ${result.requirements.non_attestations.length}`)
    console.log(`   Total Requirements: ${result.requirements.attestations.length + result.requirements.non_attestations.length}`)
    console.log(`   Pages autonomously analyzed: ${result.pages_analyzed}`)

    console.log('\n🎉 AI-autonomous analysis completed successfully!')
    console.log('\n💡 This analysis used AI to:')
    console.log('   • Decide which pages to scrape')
    console.log('   • Analyze content intelligently')
    console.log('   • Extract requirements comprehensively')
    console.log('   • Classify requirements accurately')

  } catch (error) {
    console.error('❌ Fatal error:', error.message)
    process.exit(1)
  }
}

// Run the main function
main().catch(console.error)

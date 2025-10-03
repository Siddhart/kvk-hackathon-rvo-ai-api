import fs from 'fs'
import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import OpenAI from 'openai'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Initialize OpenAI client
let openai = null
openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

class RVOAgentAIAutonomous {
    constructor() {
        this.baseUrl = 'https://www.rvo.nl'
        this.visitedUrls = new Set()
        this.attestationSchema = this.loadAttestationSchema()
    }

    /**
     * Load attestation schema from JSON file
     */
    loadAttestationSchema() {
        try {
            const schemaData = fs.readFileSync('./attestation-schema.json', 'utf8')
            return JSON.parse(schemaData)
        } catch (error) {
            return null
        }
    }

    /**
     * Main function - AI decides what to scrape and analyze
     */
    async analyzeSubsidy(url) {
        try {
            // Step 1: AI analyzes the main page and decides what to scrape
            const scrapingPlan = await this.aiCreateScrapingPlan(url)

            // Step 2: AI executes the scraping plan
            const scrapedData = await this.aiExecuteScrapingPlan(scrapingPlan)

            // Step 3: AI analyzes all collected data and extracts requirements
            const requirements = await this.aiAnalyzeAllData(scrapedData, url)

            return {
                url: url,
                title: scrapedData.mainPage?.title || 'Unknown',
                requirements: requirements,
                analyzed_at: new Date().toISOString(),
                pages_analyzed: scrapedData.allPages.length,
                ai_scraping_plan: scrapingPlan
            }

        } catch (error) {
            console.error(`Error in AI-autonomous analysis:`, error.message)
            return {
                url: url,
                error: error.message,
                analyzed_at: new Date().toISOString()
            }
        }
    }

    /**
     * AI creates a scraping plan based on the main page
     */
    async aiCreateScrapingPlan(mainUrl) {
        if (!openai) {
            console.error('❌ OPENAI_API_KEY environment variable is required for autonomous analysis')
            process.exit(1)
        }


        try {
            // First, get the main page content
            const mainPageData = await this.scrapePage(mainUrl)

            // Extract all actual links from the page
            const actualLinks = this.extractActualLinks(mainPageData.html, mainUrl)

            // Extract document links from the page
            const documentLinks = this.extractDocumentLinks(mainPageData.html, mainUrl)

            const prompt = `
You are an expert web scraper for Dutch government subsidy websites. Analyze the following page and create a scraping plan to find ALL requirements for this subsidy.

MAIN PAGE CONTENT:
URL: ${mainUrl}
Title: ${mainPageData.title}
Content: ${mainPageData.textContent.substring(0, 3000)}

ACTUAL LINKS FOUND ON THE PAGE:
${actualLinks.map(link => `- ${link.url} (${link.text})`).join('\n')}

DOCUMENT LINKS FOUND ON THE PAGE:
${documentLinks.map(doc => `- ${doc.url} (${doc.text}) [${doc.type.toUpperCase()}]`).join('\n')}

TASK: Create a scraping plan to find requirements. You MUST ONLY use the actual links provided above. Do NOT create or hallucinate any URLs. Include both web pages and documents in your plan.

Select the most relevant links from the actual links list that are likely to contain requirement information. Look for:
1. Links to pages about requirements, documents, procedures, conditions
2. Links to application forms, checklists, or guides
3. Links to specific subsidy modules or types
4. Any other relevant pages that might contain requirement information

Return ONLY a JSON object with this exact format:
{
  "main_page": {
    "url": "${mainUrl}",
    "title": "${mainPageData.title}",
    "priority": "high"
  },
  "sub_pages": [
    {
      "url": "actual_url_from_links_list",
      "reason": "why this page is important for requirements",
      "priority": "high|medium|low"
    }
  ],
  "documents": [
    {
      "url": "document_url_from_document_links_list",
      "reason": "why this document is important for requirements",
      "priority": "high|medium|low"
    }
  ],
  "max_pages": 8,
  "max_documents": 5,
  "focus_keywords": ["requirement", "document", "procedure", "condition", "application"]
}

CRITICAL: Only use URLs from the actual links list provided above. Do not create or guess any URLs.
`

            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert web scraper for Dutch government websites. Create detailed scraping plans to find subsidy requirements. You MUST only use actual URLs found on the page. Return only valid JSON."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1500
            })

            const response = completion.choices[0].message.content.trim()

            try {
                const plan = JSON.parse(response)

                // Validate that all URLs in the plan are from the actual links
                const validPlan = this.validateScrapingPlan(plan, actualLinks)

                return validPlan
            } catch (parseError) {
                return this.createFallbackScrapingPlan(mainUrl, mainPageData)
            }

        } catch (error) {
            const mainPageData = await this.scrapePage(mainUrl)
            return this.createFallbackScrapingPlan(mainUrl, mainPageData)
        }
    }

    /**
     * AI executes the scraping plan
     */
    async aiExecuteScrapingPlan(plan) {

        const allPages = []
        const allDocuments = []

        // Scrape main page
        try {
            const mainPage = await this.scrapePage(plan.main_page.url)
            allPages.push({
                ...mainPage,
                priority: plan.main_page.priority,
                reason: 'Main subsidy page'
            })
        } catch (error) {
        }

        // Scrape sub-pages
        for (const subPage of plan.sub_pages.slice(0, plan.max_pages || 8)) {
            try {
                if (!this.visitedUrls.has(subPage.url)) {
                    // First check if URL exists before scraping
                    const urlExists = await this.checkUrlExists(subPage.url)
                    if (urlExists) {
                        const pageData = await this.scrapePage(subPage.url)
                        allPages.push({
                            ...pageData,
                            priority: subPage.priority,
                            reason: subPage.reason
                        })
                        this.visitedUrls.add(subPage.url)

                        // Add delay to be respectful
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    } else {
                    }
                }
            } catch (error) {
            }
        }

        // Process documents
        for (const document of plan.documents.slice(0, plan.max_documents || 5)) {
            try {
                if (!this.visitedUrls.has(document.url)) {
                    const documentType = this.getDocumentType(document.url)
                    const documentText = await this.extractDocumentText(document.url, documentType)

                    if (documentText) {
                        allDocuments.push({
                            url: document.url,
                            title: document.url.split('/').pop() || 'Document',
                            textContent: documentText,
                            priority: document.priority,
                            reason: document.reason,
                            type: documentType
                        })
                        this.visitedUrls.add(document.url)

                        // Add delay to be respectful
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    }
                }
            } catch (error) {
            }
        }

        return {
            mainPage: allPages[0],
            allPages: allPages,
            allDocuments: allDocuments
        }
    }

    /**
     * AI analyzes all scraped data and extracts requirements
     */
    async aiAnalyzeAllData(scrapedData, originalUrl) {
        if (!openai) {
            console.error('❌ OPENAI_API_KEY environment variable is required for analysis')
            process.exit(1)
        }


        // Combine all content from pages and documents
        const pageContent = scrapedData.allPages.map(page =>
            `=== ${page.title} (${page.reason}) ===\n${page.textContent}`
        ).join('\n\n')

        const documentContent = scrapedData.allDocuments.map(doc =>
            `=== ${doc.title} (${doc.reason}) [${doc.type.toUpperCase()}] ===\n${doc.textContent}`
        ).join('\n\n')

        const allContent = pageContent + (documentContent ? '\n\n' + documentContent : '')

        // Debug: Show content being analyzed

        // Create schema-based prompt
        const schemaPrompt = this.attestationSchema ? this.createSchemaBasedPrompt(allContent) : this.createBasicPrompt(allContent)

        const prompt = schemaPrompt

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in Dutch government subsidies and business requirements. You have been provided with website content data to analyze. Your task is to extract ALL requirements from this data and classify them as attestations or non-attestations. Return only valid JSON format."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 2500
            })

            const response = completion.choices[0].message.content.trim()

            try {
                // Clean the response to extract JSON
                let jsonResponse = response.trim()

                // Try to extract JSON from the response if it's wrapped in markdown
                if (jsonResponse.includes('```json')) {
                    const jsonMatch = jsonResponse.match(/```json\s*([\s\S]*?)\s*```/)
                    if (jsonMatch) {
                        jsonResponse = jsonMatch[1].trim()
                    }
                }

                // Try to extract JSON if it's wrapped in other text
                if (jsonResponse.includes('{') && jsonResponse.includes('}')) {
                    const startIndex = jsonResponse.indexOf('{')
                    const lastIndex = jsonResponse.lastIndexOf('}')
                    if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
                        jsonResponse = jsonResponse.substring(startIndex, lastIndex + 1)
                    }
                }

                const parsed = JSON.parse(jsonResponse)

                return {
                    attestations: parsed.attestations || [],
                    non_attestations: parsed.non_attestations || [],
                    analysis_notes: parsed.analysis_notes || 'AI analysis completed'
                }
            } catch (parseError) {
                return this.fallbackAnalysis(scrapedData)
            }

        } catch (error) {
            return this.fallbackAnalysis(scrapedData)
        }
    }

    /**
     * Extract actual links from HTML content
     */
    extractActualLinks(html, baseUrl) {
        const $ = cheerio.load(html)
        const links = []

        $('a[href]').each((i, element) => {
            const href = $(element).attr('href')
            const text = $(element).text().trim()

            if (href && text) {
                let fullUrl = href
                if (href.startsWith('/')) {
                    fullUrl = this.baseUrl + href
                } else if (href.startsWith('http')) {
                    fullUrl = href
                } else if (href.startsWith('#')) {
                    // Skip anchor links
                    return
                }

                // Only include RVO.nl links
                if (fullUrl.includes('rvo.nl') && !this.visitedUrls.has(fullUrl)) {
                    links.push({
                        url: fullUrl,
                        text: text.substring(0, 100), // Limit text length
                        href: href
                    })
                }
            }
        })

        // Remove duplicates and sort by relevance
        const uniqueLinks = links.filter((link, index, self) =>
            index === self.findIndex(l => l.url === link.url)
        )

        return uniqueLinks
    }

    /**
     * Extract document links (PDFs, DOCX, etc.) from HTML content
     */
    extractDocumentLinks(html, baseUrl) {
        const $ = cheerio.load(html)
        const documentLinks = []

        $('a[href]').each((i, element) => {
            const href = $(element).attr('href')
            const text = $(element).text().trim()

            if (href) {
                let fullUrl = href
                if (href.startsWith('/')) {
                    fullUrl = this.baseUrl + href
                } else if (href.startsWith('http')) {
                    fullUrl = href
                }

                // Check if it's a document file
                const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
                const isDocument = documentExtensions.some(ext => fullUrl.toLowerCase().includes(ext))

                if (isDocument && !this.visitedUrls.has(fullUrl)) {
                    documentLinks.push({
                        url: fullUrl,
                        text: text.substring(0, 100),
                        href: href,
                        type: this.getDocumentType(fullUrl)
                    })
                }
            }
        })

        return documentLinks
    }

    /**
     * Get document type from URL
     */
    getDocumentType(url) {
        const urlLower = url.toLowerCase()
        if (urlLower.includes('.pdf')) return 'pdf'
        if (urlLower.includes('.docx') || urlLower.includes('.doc')) return 'docx'
        if (urlLower.includes('.xlsx') || urlLower.includes('.xls')) return 'xlsx'
        if (urlLower.includes('.pptx') || urlLower.includes('.ppt')) return 'pptx'
        return 'unknown'
    }

    /**
     * Extract text from a document
     */
    async extractDocumentText(url, documentType) {
        try {

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const buffer = await response.buffer()

            switch (documentType) {
                case 'pdf':
                    return await this.extractPdfText(buffer)
                case 'docx':
                    return await this.extractDocxText(buffer)
                case 'xlsx':
                    return await this.extractXlsxText(buffer)
                default:
                    return ''
            }
        } catch (error) {
            return ''
        }
    }

    /**
     * Extract text from PDF
     */
    async extractPdfText(buffer) {
        try {
            const data = await pdf(buffer)
            return data.text
        } catch (error) {
            return ''
        }
    }

    /**
     * Extract text from DOCX
     */
    async extractDocxText(buffer) {
        try {
            const result = await mammoth.extractRawText({ buffer })
            return result.value
        } catch (error) {
            return ''
        }
    }

    /**
     * Extract text from XLSX
     */
    async extractXlsxText(buffer) {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' })
            let text = ''

            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName]
                const sheetText = XLSX.utils.sheet_to_txt(worksheet)
                text += `\n=== Sheet: ${sheetName} ===\n${sheetText}\n`
            })

            return text
        } catch (error) {
            return ''
        }
    }

    /**
     * Validate scraping plan to ensure all URLs are from actual links
     */
    validateScrapingPlan(plan, actualLinks) {
        const actualUrls = new Set(actualLinks.map(link => link.url))

        const validSubPages = plan.sub_pages.filter(subPage => {
            const isValid = actualUrls.has(subPage.url)
            if (!isValid) {
            }
            return isValid
        })

        return {
            ...plan,
            sub_pages: validSubPages
        }
    }

    /**
     * Fallback scraping plan
     */
    createFallbackScrapingPlan(mainUrl, mainPageData) {
        // Simple fallback that just returns the main page
        // Let the AI do all the intelligent link selection
        return {
            main_page: {
                url: mainUrl,
                title: mainPageData.title,
                priority: 'high'
            },
            sub_pages: [],
            max_pages: 1,
            focus_keywords: []
        }
    }

    /**
     * Fallback analysis
     */
    fallbackAnalysis(scrapedData) {
        // Simple fallback that returns empty results
        // Let the AI do all the work instead of hardcoded patterns
        return {
            attestations: [],
            non_attestations: [],
            analysis_notes: 'Fallback analysis - no hardcoded patterns used'
        }
    }

    /**
     * Check if a URL exists without downloading the full content
     */
    async checkUrlExists(url) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
            return response.ok
        } catch (error) {
            return false
        }
    }

    /**
     * Scrape a single page
     */
    async scrapePage(url) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const html = await response.text()
            const $ = cheerio.load(html)

            // Extract title
            const title = $('h1').first().text().trim() || $('title').text().trim()

            // Remove navigation, footer, etc.
            $('nav, header, footer, .navigation, .menu, .sidebar').remove()

            // Get text content
            const textContent = $('body').text().replace(/\s+/g, ' ').trim()

            return {
                url: url,
                title: title,
                html: html,
                textContent: textContent
            }

        } catch (error) {
            throw new Error(`Failed to scrape ${url}: ${error.message}`)
        }
    }

    /**
     * Create schema-based prompt for AI analysis
     */
    createSchemaBasedPrompt(allContent) {
        const schema = this.attestationSchema.attestation_schema

        // Build field list with descriptions
        const fieldList = Object.keys(schema).map(fieldKey => {
            const displayName = schema[fieldKey]
            return `${fieldKey} (${displayName})`
        }).join(', ')

        return `
Analyze the following website content data and extract ALL requirements, then classify each one as either an "attestation" or "non-attestation".

WEBSITE CONTENT DATA:
${allContent.substring(0, 12000)}

POSSIBLE ATTESTATION FIELDS (only include if mentioned or required):
${fieldList}

CRITICAL CLASSIFICATION RULES:

ATTESTATIONS (Direct data fields that prove something exists - only include if mentioned in content or clearly required):
- Only include fields from the list above that are actually mentioned in the content
- Or fields that are clearly required based on forms, procedures, or application requirements
- These are singular data points that come from digital wallets or official registrations
- Use the exact field key names (e.g., "chamber_of_commerce_kvk_nummer")

NON-ATTESTATIONS (Everything else that needs to be created or provided):
- Forms, applications, documents that need to be filled out
- Plans, reports, studies that need to be created
- Procedures, steps, processes that need to be followed
- Any requirement that is NOT a direct data field

IMPORTANT ANALYSIS GUIDELINES:
1. Look for forms, application procedures, and requirements in the content
2. Identify what data fields are mentioned or required
3. Only include attestation fields that are actually relevant to this subsidy
4. Be intelligent about detecting requirements even if not explicitly stated
5. Look for application forms, checklists, and procedural requirements

INSTRUCTIONS:
1. Carefully analyze the content to find all requirements
2. For attestations, only include field keys from the list that are mentioned or clearly required
3. For non-attestations, include all forms, documents, procedures, and other requirements
4. Be comprehensive but accurate - don't guess

CRITICAL: Return ONLY a valid JSON object in this exact format. Do not include any other text, explanations, or markdown formatting:

{
  "attestations": ["chamber_of_commerce_kvk_nummer", "bank_iban"],
  "non_attestations": ["quickscan", "projectplan"],
  "analysis_notes": "Brief summary of what was found"
}
`
    }

    /**
     * Create basic prompt for AI analysis (fallback)
     */
    createBasicPrompt(allContent) {
        return `
Analyze the following website content data and extract ALL requirements, then classify each one as either an "attestation" or "non-attestation".

WEBSITE CONTENT DATA:
${allContent.substring(0, 12000)}

CRITICAL CLASSIFICATION RULES:

ATTESTATIONS (Singular data points that prove something exists - these come from digital wallets or official registrations):
- Business registration numbers: KvK-nummer, RSIN, BTW-nummer, Vestigingsnummer
- Bank details: IBAN, bankrekeningnummer
- Company information: Statutairenaam, Handelsnaam, Bezoekadres, emailadres
- Business details: Ondernemingsvorm, SBI-code, Aantal werknemers
- Contact information: Contactpersoon gegevens
- Any singular data point that proves a business status or registration

NON-ATTESTATIONS (Documents that need to be CREATED for this specific subsidy):
- Plans: Projectplan, ondernemingsplan, begrotingsplan, plan van aanpak
- Reports: Rapportage, verslag, evaluatie, studie
- Applications: Aanvraagformulier, aanvraag, aanvraagdocumenten
- Project documents: Projectgegevens, projecttitel, projectbudget, projectomschrijving
- Analysis documents: Haalbaarheidsstudie, risicoanalyse, kostenbegroting, marktonderzoek
- Project types: Demonstratieproject, investeringsvoorbereidingsproject, pilotproject
- Any document that needs to be created specifically for this subsidy application

INSTRUCTIONS:
1. Extract ALL requirements mentioned across all pages
2. Classify each as attestation or non-attestation
3. Use Dutch terms where appropriate
4. Be comprehensive - don't miss any requirements
5. Focus on what applicants actually need to provide

CRITICAL: Return ONLY a valid JSON object in this exact format. Do not include any other text, explanations, or markdown formatting:

{
  "attestations": ["requirement1", "requirement2"],
  "non_attestations": ["requirement1", "requirement2"],
  "analysis_notes": "Brief summary of what was found and why"
}
`
    }


}

export { RVOAgentAIAutonomous }

# Batch Upload Feature

## Overview
The Batch Upload feature allows you to prepare for multiple job interviews simultaneously by uploading a single JSON file containing multiple job descriptions and company information.

## How to Use

### 1. Prepare Your JSON File

Create a JSON file with an array of job cases. Each case should include:

- `id` (string, required): A unique identifier for the case
- `jd` (string, required): The full job description text
- `company_url` (string, required): The company website URL (must be http:// or https://)
- `days` (number, required): Number of days available for preparation (1-60)

### 2. Example Format

```json
[
  {
    "id": "google-swe",
    "jd": "We are looking for a Senior Software Engineer to join our team. You will be responsible for designing and developing scalable web applications using React, Node.js, and cloud technologies. Requirements include 5+ years of experience...",
    "company_url": "https://google.com",
    "days": 14
  },
  {
    "id": "meta-backend",
    "jd": "Backend Engineer position focusing on distributed systems. Work with Python, Go, and large-scale databases. Design APIs and microservices...",
    "company_url": "https://meta.com",
    "days": 10
  },
  {
    "id": "amazon-ml",
    "jd": "Machine Learning Engineer role. Build and deploy ML models at scale. Experience with TensorFlow, PyTorch, AWS SageMaker required...",
    "company_url": "https://amazon.com",
    "days": 7
  }
]
```

### 3. Upload Process

1. Navigate to **Create → Batch Upload** tab
2. Download the template file (optional) to see the format
3. Drag and drop your JSON file or click to browse
4. Review the case count and file name
5. Click **Start** to begin processing

### 4. Monitoring Progress

Once started, you'll see a live progress table showing:

- **Case ID**: Your custom identifier for each case
- **Status**: Current state (Queued → Running → Ready/Failed)
- **Progress**: Current pipeline stage or result
  - For running cases: shows the current stage (e.g., "Crawling company website...")
  - For completed cases: shows "Open kit →" link
  - For failed cases: shows error message

### 5. Batch Processing Details

- Cases are processed **sequentially** (one at a time)
- Each case goes through the full pipeline:
  1. Crawl company website
  2. Extract company information
  3. Analyze role requirements
  4. Generate questions
  5. Create flashcards
  6. Build study schedule
- If one case fails, the batch continues with remaining cases
- You can see real-time updates for the currently processing case

### 6. After Completion

Once all cases finish:
- View summary showing success/failure counts
- Click "Open kit →" for any successful case to review
- Failed cases display error messages for debugging
- Upload another file to process more batches

## Tips

- Use descriptive IDs like "company-role" for easy identification
- Ensure job descriptions are complete and detailed
- Verify all company URLs are accessible
- Set realistic `days` values (1-60) based on your interview timeline
- Start with a small batch (2-3 cases) to test the format

## Common Issues

### File Validation Errors

**"The file must contain a JSON array"**
- Ensure your file starts with `[` and ends with `]`

**"Item [0]: 'id' must be a non-empty string"**
- Check that every case has an `id` field with text

**"Item [1]: 'company_url' is not a valid URL"**
- URLs must start with `http://` or `https://`

**"Item [2]: 'days' must be an integer between 1 and 60"**
- Use whole numbers only, no decimals

### Processing Errors

**"Failed to create kit"**
- Check your internet connection
- Verify the company URL is accessible
- Ensure job description is not empty

**"Pipeline failed"**
- The kit was created but generation failed
- You can still open the kit and retry individual sections

## Example Use Cases

### Multiple Companies, Same Role
Preparing for Software Engineer interviews at different companies:
```json
[
  {"id": "google-swe", "jd": "...", "company_url": "https://google.com", "days": 14},
  {"id": "meta-swe", "jd": "...", "company_url": "https://meta.com", "days": 14},
  {"id": "amazon-swe", "jd": "...", "company_url": "https://amazon.com", "days": 14}
]
```

### Different Roles, Same Company
Multiple positions at one company:
```json
[
  {"id": "acme-frontend", "jd": "...", "company_url": "https://acme.com", "days": 10},
  {"id": "acme-backend", "jd": "...", "company_url": "https://acme.com", "days": 10},
  {"id": "acme-fullstack", "jd": "...", "company_url": "https://acme.com", "days": 10}
]
```

### Career Fair Prep
Preparing for multiple companies from a career fair:
```json
[
  {"id": "startup1-eng", "jd": "...", "company_url": "https://startup1.com", "days": 5},
  {"id": "startup2-eng", "jd": "...", "company_url": "https://startup2.com", "days": 5},
  {"id": "bigco-intern", "jd": "...", "company_url": "https://bigco.com", "days": 7}
]
```

## Technical Notes

- Maximum file size: Depends on server configuration
- Processing is **sequential** to avoid overloading the LLM API
- Each kit takes 1-3 minutes to generate depending on complexity
- Failed cases don't stop the batch - remaining cases continue
- All kits are associated with your account and appear in your dashboard

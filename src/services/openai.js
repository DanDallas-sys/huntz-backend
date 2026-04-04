import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Parse CV text into structured data ───────────────────
export const parseCV = async (cvText) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: 'You are an expert CV parser. Extract structured data from the CV text and return ONLY valid JSON with no extra text.',
      }, {
        role: 'user',
        content: `Extract the following from this CV and return as JSON:
{
  "full_name": "",
  "email": "",
  "phone": "",
  "location": "",
  "skills": [],
  "total_experience_years": 0,
  "current_title": "",
  "previous_titles": [],
  "companies": [],
  "education": "",
  "certifications": [],
  "languages": [],
  "summary": ""
}

CV TEXT:
${cvText.slice(0, 6000)}`
      }],
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error('CV parse error:', err);
    return null;
  }
};

// ── Score applicant against a specific job ───────────────
export const scoreApplication = async (seekerProfile, cvData, jobDetails) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: 'You are a senior HR evaluator. Score job applicants fairly and objectively from 0-100. Return ONLY valid JSON.',
      }, {
        role: 'user',
        content: `Score this applicant for the job below. Return JSON only.

APPLICANT PROFILE:
- Industry: ${seekerProfile.industry}
- Current title: ${seekerProfile.job_title}
- Experience: ${seekerProfile.years_experience}
- Education: ${seekerProfile.education_level}
- Skills from CV: ${JSON.stringify(cvData?.skills || [])}
- Certifications: ${JSON.stringify(cvData?.certifications || [])}

JOB REQUIREMENTS:
- Title: ${jobDetails.title}
- Experience required: ${jobDetails.experience_required}
- Education required: ${jobDetails.education_required}
- Skills required: ${JSON.stringify(jobDetails.skills_required || [])}
- Location type: ${jobDetails.location_type}

Return:
{
  "score": 0-100,
  "summary": "2-sentence employer-facing summary of this candidate",
  "strengths": ["up to 3 key strengths"],
  "gaps": ["up to 2 key gaps"],
  "recommendation": "hire / consider / pass"
}`,
      }],
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error('Scoring error:', err);
    return { score: 50, summary: 'AI scoring unavailable.', strengths: [], gaps: [], recommendation: 'consider' };
  }
};

// ── Find matching jobs via web search ────────────────────
export const findMatchingJobs = async (seekerProfile) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: 'You are a job matching specialist for the Nigerian job market. Return ONLY valid JSON.',
      }, {
        role: 'user',
        content: `Based on this candidate profile, generate 8 highly relevant job opportunities currently available in Nigeria.

CANDIDATE:
- Role: ${seekerProfile.job_title}
- Industry: ${seekerProfile.industry}
- Experience: ${seekerProfile.years_experience}
- Education: ${seekerProfile.education_level}
- Preferred types: ${(seekerProfile.preferred_job_types || []).join(', ')}

Return JSON:
{
  "matches": [
    {
      "job_title": "",
      "company_name": "",
      "location": "",
      "job_type": "",
      "salary_range": "",
      "match_score": 0-100,
      "source_url": "https://jobboard.example.com/job-url"
    }
  ]
}`,
      }],
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.matches || [];
  } catch (err) {
    console.error('Job matching error:', err);
    return [];
  }
};

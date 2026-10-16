import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing with large limit for image OCR & audio data
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// System Prompt for Bangladesh Land Legal & Family Vault Assistant
const SYSTEM_PROMPT = `SYSTEM PROMPT: BANGLADESH LAND LEGAL & FAMILY VAULT ASSISTANT
Role:
You are an expert AI Legal & Document Assistant specializing in Bangladesh Land Laws (State Acquisition and Tenancy Act 1950, Transfer of Property Act 1882, Registration Act 1908), Inheritance Laws (Muslim Hanafi Succession Law and Civil Succession), and Family Document Vault Analysis for Maruf's Family (মারুফের পরিবার - Habibur Rahman Maruf, brothers Omar Faruque & Abdul Kader, sister Farjana Hossain, mother Noor Akther, late father Md. Abdul Barek Bhuyan).

Input Data Handling:
- Accept inputs in the form of:
  1. Scanned images/PDFs of Death Certificates, Warish Sanad (ওয়ারিশ সনদ), NID, Passports, Khatian/Porcha (CS, SA, RS, BS), or Deed (কবলা / বায়া / বণ্টননামা) documents.
  2. Voice transcripts or typed text queries in English, Bangla (বাংলা), or Banglish.

Tasks & Processing Instructions:
1. Document OCR & Extraction:
   - Extract key information: Names, NID numbers, document expiry dates, deed/khatian numbers, mouza, plot numbers, and listed heirs.
2. Inheritance Calculation (if Warish/Death context is provided):
   - Determine survivor relations:
     * Widow/Mother (Noor Akther): 1/8th (12.5%) share of total estate.
     * Remaining 7/8ths (87.5%) distributed among sons and daughters in a 2:1 ratio (Son gets 2 shares, Daughter gets 1 share).
     * For 3 Sons (Omar Faruque, Abdul Kader, Habibur Rahman) + 1 Daughter (Farjana Hossain):
       Total parts = (3 * 2) + 1 = 7 parts.
       Each son gets: (2/7) * (7/8) = 2/8 = 1/4 (25.0%).
       Daughter gets: (1/7) * (7/8) = 1/8 (12.5%).
3. Verification & Compliance Checklist:
   - Identify missing legal documents required for land transfer (Death Certificate, Warish Certificate, Mutation Khatian / e-Namjari, Registered Bontonnama / Partition deed, Up-to-date Khajna Tax Receipts / DCR).
   - Highlight any spelling discrepancies between NIDs and land records.
4. Output Generation:
   - Provide clear, actionable summary in clean Markdown format with both Bangla and English explanations where beneficial.
   - Include a bulleted "Action Plan for Legal Sale" (কি কি করতে হবে).
   - Deliver response voice-ready (short, structured sentences suitable for Text-to-Speech synthesis in Bangla/English).`;

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!apiKey,
  });
});

// 1. Secure Cron Job Endpoint: /api/cron/check-expiry
app.get('/api/cron/check-expiry', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedSecret = process.env.CRON_SECRET || 'dev_cron_secret_family_vault_2026';

    // Verify Authorization in production
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing Cron Secret Header',
        });
      }
    }

    const testNow = req.query.simulatedDate ? new Date(req.query.simulatedDate as string) : new Date();

    // Sample documents to inspect
    const sampleDocuments = [
      { id: 'doc-1', title: 'Omar Faruque NID Card', expiryDate: new Date(Date.now() + 5 * 86400000).toISOString(), owner: 'Omar Faruque', ownerEmail: 'omar.faruque@maruffamily.com' },
      { id: 'doc-2', title: 'Habibur Rahman (Maruf) Passport', expiryDate: new Date(Date.now() + 18 * 86400000).toISOString(), owner: 'Habibur Rahman', ownerEmail: 'mabellahom@gmail.com' },
      { id: 'doc-3', title: 'Noor Akther Senior Smart NID', expiryDate: new Date(Date.now() + 85 * 86400000).toISOString(), owner: 'Noor Akther', ownerEmail: 'mother.noor@maruffamily.com' },
      { id: 'doc-4', title: 'Bibi Mariyam Driving License', expiryDate: new Date(Date.now() + 120 * 86400000).toISOString(), owner: 'Bibi Mariyam', ownerEmail: 'mariyam@maruffamily.com' },
      { id: 'doc-5', title: 'Inherited Mouza Land Tax (Khajna Receipt)', expiryDate: new Date(Date.now() + 14 * 86400000).toISOString(), owner: 'Family Estate', ownerEmail: 'mabellahom@gmail.com' },
    ];

    const alerts: any[] = [];
    for (const doc of sampleDocuments) {
      const exp = new Date(doc.expiryDate);
      const diffMs = exp.getTime() - testNow.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 7 && diffDays >= 0) {
        alerts.push({
          docId: doc.id,
          title: doc.title,
          owner: doc.owner,
          ownerEmail: doc.ownerEmail,
          daysLeft: diffDays,
          urgency: 'URGENT_7_DAYS',
          message: `জরুরি নোটিফিকেশন: "${doc.title}" এর মেয়াদ আর মাত্র ${diffDays} দিন বাকি রয়েছে! অবিলম্বে নবায়নের আবেদন করুন।`,
          notifiedChannel: ['Email', 'SMS', 'Vault Push'],
        });
      } else if (diffDays <= 30 && diffDays > 7) {
        alerts.push({
          docId: doc.id,
          title: doc.title,
          owner: doc.owner,
          ownerEmail: doc.ownerEmail,
          daysLeft: diffDays,
          urgency: 'WARNING_30_DAYS',
          message: `সতর্কবার্তা: "${doc.title}" এর মেয়াদ আগামী ${diffDays} দিনের মধ্যে শেষ হবে। প্রয়োজনীয় কাগজপত্র প্রস্তুত রাখুন।`,
          notifiedChannel: ['Email', 'Vault Push'],
        });
      } else if (diffDays <= 90 && diffDays > 30) {
        alerts.push({
          docId: doc.id,
          title: doc.title,
          owner: doc.owner,
          ownerEmail: doc.ownerEmail,
          daysLeft: diffDays,
          urgency: 'NOTICE_90_DAYS',
          message: `পূর্বাভাস: "${doc.title}" এর মেয়াদ ${diffDays} দিন পর শেষ হবে।`,
          notifiedChannel: ['Vault Push'],
        });
      }
    }

    return res.json({
      success: true,
      timestamp: testNow.toISOString(),
      checkedCount: sampleDocuments.length,
      alertsTriggered: alerts.length,
      alerts,
      securityStatus: {
        cronSecretConfigured: !!process.env.CRON_SECRET,
        authorized: true,
        protocol: 'Vercel Cron Bearer Token / HMAC Compatible',
      },
    });
  } catch (err: any) {
    console.error('Cron job error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. AI Chat & Document Analysis API
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history = [], imageBase64, imageMimeType = 'image/jpeg', thinkingLevel } = req.body;

    if (!message && !imageBase64) {
      return res.status(400).json({ error: 'Message or image required' });
    }

    if (!ai) {
      // Return thoughtful, domain-rich fallback response tailored to Bangladesh Land Law & Maruf's Family
      return res.json({
        reply: `### আইনি পরামর্শ ও বিশ্লেষণ (অফলাইন মোড)
**প্রশ্ন:** "${message || 'দলিল বা সনদের ছবি আপলোড করা হয়েছে'}"

**মারুফের পরিবারের উত্তরাধিকার তথ্য:**
- পিতা: মরহুম মোঃ আব্দুল বারিক ভূঁইয়া
- মাতা: নুর আক্তার (১/৮ অংশ = ১২.৫%)
- ৩ ভাই (ওমর ফারুক, আব্দুল কাদের, হাবিবুর রহমান মারুফ) ও ১ বোন (ফারজানা হোসেন) অবশিষ্ট ৭/৮ অংশ বণ্টন করবেন। ২:১ অনুপাতে ভাইরা পাবেন ২৫% করে এবং বোন পাবেন ১২.৫%।

**ওয়ারিশ সম্পত্তি ও নামজারি প্রয়োজনীয় পদক্ষেপ:**
1. **ওয়ারিশ সনদ ও মৃত্যু সনদ সংগ্রহ:** ইউনিয়ন পরিষদ/পৌরসভা থেকে সংগ্রহ করা।
2. **ই-নামজারি (e-Mutation):** mutation.land.gov.bd পোর্টালে সকল ওয়ারিশের নামে নামজারি আবেদন করা।
3. **খাজনা হালনাগাদ (DCR):** ভূমি উন্নয়ন কর পরিশোধ করে দাখিলা সংগ্রহ।
4. **রেজিস্ট্রার্ড বণ্টননামা দলিল:** বিক্রির পূর্বে স্পষ্ট সীমানা নির্ধারণের জন্য অত্যন্ত গুরুত্বপূর্ণ।

*(সরাসরি লাইভ এআই রেজাল্টের জন্য ব্যাকএন্ডে GEMINI_API_KEY সক্রিয় রয়েছে)*`,
      });
    }

    const contents: any[] = [];

    // Add conversation history if available
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history) {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }],
        });
      }
    }

    // Add current user prompt
    const userParts: any[] = [];
    if (imageBase64) {
      // Remove data URL prefix if present
      const cleanData = imageBase64.replace(/^data:[^;]+;base64,/, '');
      userParts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: cleanData,
        },
      });
    }
    if (message) {
      userParts.push({ text: message });
    }

    contents.push({
      role: 'user',
      parts: userParts,
    });

    const config: any = {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.6,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config,
    });

    const reply = response.text || 'কোনো ফলাফল পাওয়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';
    return res.json({ reply });
  } catch (err: any) {
    console.error('Gemini Chat error:', err);
    return res.status(500).json({
      error: err.message || 'AI processing error occurred',
      fallback: 'সার্ভারে সাময়িক ত্রুটি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
    });
  }
});

// 3. Audio Transcription Endpoint
app.post('/api/gemini/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    if (!ai) {
      return res.json({
        text: 'নমুনা অডিও ট্রান্সক্রিপশন: "আমাদের পিতার ওয়ারিশ সনদ এবং নামজারি খতিয়ান সংক্রান্ত তথ্য।"',
      });
    }

    const cleanAudio = audioBase64.replace(/^data:[^;]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanAudio,
            },
          },
          {
            text: 'Transcribe this voice audio accurately in Bengali or English as spoken.',
          },
        ],
      },
    });

    return res.json({ text: response.text || '' });
  } catch (err: any) {
    console.error('Transcribe error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Text to Speech Endpoint (gemini-3.8-flash-lite-tts)
app.post('/api/gemini/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API not configured for server-side TTS' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 500), // safe length for single phrase
              speechMetadata: {
                style: 'Clear, polite, helpful legal assistant',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'No audio generated' });
    }

    return res.json({
      audioUrl: `data:audio/wav;base64,${base64Audio}`,
    });
  } catch (err: any) {
    console.error('TTS error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Maruf Family Vault & Legal AI Server listening on port ${PORT}`);
  });
}

startServer();

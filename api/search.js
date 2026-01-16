// Vercel Serverless Function
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const cache = {};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const query = req.query.q;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
    }

    if (cache[query]) {
        console.log('Returning cached result for:', query);
        return res.status(200).json(cache[query]);
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `"${query}"에 대해 다음 정보를 JSON 형식으로 제공해주세요:

{
  "title": "작품명 (한글)",
  "tmdbQuery": "영문 작품명 (TMDB 검색용)",
  "tag": "책 → 영화" 또는 "영화 → 책" 또는 "애니 → 책" 등,
  "original": "원작 정보 (예: J.R.R. 톨킨의 소설)",
  "recommendation": "추천 순서 (예: 책부터 읽는 것을 강력 추천합니다)",
  "reason": "추천 이유 (2-3문장, 구체적으로)",
  "order": ["감상 순서 배열 - 각 항목은 명확하게"],
  "tips": ["팁 배열 - 2-3개의 유용한 팁"]
}

JSON만 응답하고 다른 텍스트는 포함하지 마세요. 마크다운 코드 블록도 사용하지 마세요.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        let workData;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                workData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to parse AI response',
                rawText: text 
            });
        }

        let posterUrl = null;
        try {
            const tmdbQuery = workData.tmdbQuery || workData.title;
            const tmdbResponse = await fetch(
                `${TMDB_BASE_URL}/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=ko-KR`
            );
            const tmdbData = await tmdbResponse.json();
            
            if (tmdbData.results && tmdbData.results[0]?.poster_path) {
                posterUrl = `${TMDB_IMAGE_BASE}${tmdbData.results[0].poster_path}`;
            }
        } catch (tmdbError) {
            console.error('TMDB Error:', tmdbError);
        }

        const result_data = {
            success: true,
            work: workData,
            posterUrl: posterUrl
        };

        cache[query] = result_data;
        setTimeout(() => delete cache[query], 24 * 60 * 60 * 1000);

        return res.status(200).json(result_data);

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    }
};
```

### Step 5: 커밋하기
- 아래로 스크롤
- "Commit new file" 클릭

### Step 6: 기존 search.js 삭제 (만약 루트에 있다면)
1. 루트에 있는 `search.js` 파일 클릭
2. 쓰레기통 아이콘 (Delete) 클릭
3. "Commit changes" 클릭

---

## ✅ 최종 파일 구조 확인

이렇게 되어야 합니다:
```
chaekyoungae/
├── api/
│   └── search.js  ✅
├── index.html
├── package.json
├── vercel.json
└── .gitignore

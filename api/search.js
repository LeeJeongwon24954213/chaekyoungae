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
        return res.status(200).json(cache[query]);
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `"${query}"에 대해 다음 정보를 JSON 형식으로 제공해주세요:

{
  "title": "작품명 (한글)",
  "tmdbQuery": "영문 작품명 (TMDB 검색용)",
  "tag": "책 → 영화" 또는 "영화 → 책" 또는 "애니 ONLY" 등,
  "original": "원작 정보",
  "recommendation": "추천 순서",
  "reason": "추천 이유 (2-3문장)",
  "order": ["감상 순서 배열"],
  "tips": ["팁 배열 2-3개"]
}

JSON만 응답하세요. 마크다운 없이.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        let workData;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                workData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch (parseError) {
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to parse AI response'
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

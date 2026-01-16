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
        // Gemini API 키 확인
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found');
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-pro'
        });

        const prompt = `다음 작품 "${query}"에 대해 JSON 형식으로 정보를 제공해주세요.

응답 형식:
{
  "title": "작품명",
  "tmdbQuery": "영문 작품명",
  "tag": "책 → 영화",
  "original": "원작 정보",
  "recommendation": "추천 순서",
  "reason": "추천 이유 2-3문장",
  "order": ["순서1", "순서2"],
  "tips": ["팁1", "팁2"]
}

중요: 순수한 JSON만 응답하고, 마크다운이나 설명 없이 응답하세요.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // JSON 추출 및 파싱
        let workData;
        try {
            // 마크다운 코드 블록 제거
            let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // JSON 객체 찾기
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            workData = JSON.parse(jsonMatch[0]);

            // 필수 필드 확인
            if (!workData.title || !workData.order) {
                throw new Error('Missing required fields');
            }

        } catch (parseError) {
            console.error('Parse Error:', parseError);
            console.error('Raw text:', text);
            return res.status(500).json({ 
                success: false, 
                error: 'AI 응답 파싱 실패',
                details: parseError.message,
                rawText: text.substring(0, 500)
            });
        }

        // TMDB에서 포스터 가져오기
        let posterUrl = null;
        try {
            if (process.env.TMDB_API_KEY) {
                const tmdbQuery = workData.tmdbQuery || workData.title;
                const tmdbResponse = await fetch(
                    `${TMDB_BASE_URL}/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=ko-KR`
                );
                
                if (tmdbResponse.ok) {
                    const tmdbData = await tmdbResponse.json();
                    if (tmdbData.results && tmdbData.results[0]?.poster_path) {
                        posterUrl = `${TMDB_IMAGE_BASE}${tmdbData.results[0].poster_path}`;
                    }
                }
            }
        } catch (tmdbError) {
            console.error('TMDB Error:', tmdbError);
            // TMDB 오류는 무시하고 계속
        }

        const result_data = {
            success: true,
            work: workData,
            posterUrl: posterUrl
        };

        // 캐시 저장
        cache[query] = result_data;
        setTimeout(() => delete cache[query], 24 * 60 * 60 * 1000);

        return res.status(200).json(result_data);

    } catch (error) {
        console.error('Main Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message,
            stack: error.stack
        });
    }
};

// Vercel Serverless Function
// 이 파일은 /api/search 엔드포인트로 작동합니다

const { GoogleGenerativeAI } = require('@google/generative-ai');

// TMDB API 설정
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// 간단한 메모리 캐시
const cache = {};

module.exports = async (req, res) => {
    // CORS 설정
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

    // 캐시 확인
    if (cache[query]) {
        console.log('Returning cached result for:', query);
        return res.status(200).json(cache[query]);
    }

    try {
        // 1. Gemini API로 작품 분석
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

        // JSON 파싱
        let workData;
        try {
            // JSON 추출 (```json ``` 제거)
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

        // 2. TMDB에서 포스터 가져오기
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
            // TMDB 오류는 무시하고 계속 진행
        }

        // 결과 생성
        const result_data = {
            success: true,
            work: workData,
            posterUrl: posterUrl
        };

        // 캐시에 저장 (24시간)
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

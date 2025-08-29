-- ===================================================================
-- 부스 코드 시스템 간단 설치 스크립트
-- 작성일: 2025-08-29
-- 설명: Supabase에서 실행할 부스 코드 기본 테이블 설정
-- ===================================================================

-- 1. 부스 테이블에 코드 필드 추가 (이미 있는 경우 무시)
ALTER TABLE booths ADD COLUMN IF NOT EXISTS booth_code VARCHAR(6) UNIQUE;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMP;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. 부스 운영 기록 테이블 (운영자가 부스 코드로 접속한 기록)
CREATE TABLE IF NOT EXISTS booth_operations (
    id SERIAL PRIMARY KEY,
    booth_id INTEGER REFERENCES booths(id) ON DELETE CASCADE,
    operator_name VARCHAR(100) NOT NULL,
    operator_phone VARCHAR(20),
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 기존 부스에 샘플 코드 생성 (테스트용)
UPDATE booths 
SET booth_code = 
    CASE 
        WHEN id = 1 THEN 'ABC123'
        WHEN id = 2 THEN 'DEF456'
        WHEN id = 3 THEN 'GHI789'
        ELSE UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 3) || LPAD(id::TEXT, 3, '0'))
    END,
    code_expires_at = NOW() + INTERVAL '30 days',
    is_active = true
WHERE booth_code IS NULL;

-- 4. 테스트용 부스 생성 (없는 경우)
INSERT INTO booths (name, description, booth_code, code_expires_at, is_active)
VALUES 
    ('청소년 상담 부스', '청소년 고민 상담', 'ABC123', NOW() + INTERVAL '30 days', true),
    ('진로 체험 부스', '다양한 직업 체험', 'DEF456', NOW() + INTERVAL '30 days', true),
    ('문화 예술 부스', '예술 작품 전시 및 체험', 'GHI789', NOW() + INTERVAL '30 days', true)
ON CONFLICT (booth_code) DO NOTHING;
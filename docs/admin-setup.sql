-- 관리자 테이블 생성
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 운영자 테이블 생성
CREATE TABLE IF NOT EXISTS operators (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    assigned_booth_id INTEGER REFERENCES booths(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 부스 테이블 수정 (운영자 정보 추가)
ALTER TABLE booths ADD COLUMN IF NOT EXISTS operator_id INTEGER;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS booth_code VARCHAR(10);

-- 기본 관리자 계정 생성 (admin/0627)
INSERT INTO admins (username, password, is_super_admin) 
VALUES ('admin', '0627', true)
ON CONFLICT (username) DO NOTHING;

-- 부스별 통계 뷰 생성
CREATE OR REPLACE VIEW booth_statistics AS
SELECT 
    b.id as booth_id,
    b.name as booth_name,
    COUNT(p.id) as total_participants,
    COUNT(CASE WHEN p.gender = '남성' THEN 1 END) as male_count,
    COUNT(CASE WHEN p.gender = '여성' THEN 1 END) as female_count,
    COUNT(CASE WHEN p.school_level = '초등' THEN 1 END) as elementary_count,
    COUNT(CASE WHEN p.school_level = '중등' THEN 1 END) as middle_count,
    COUNT(CASE WHEN p.school_level = '고등' THEN 1 END) as high_count,
    MAX(p.created_at) as last_participation
FROM booths b
LEFT JOIN participants p ON b.id = p.booth_id
GROUP BY b.id, b.name;

-- 시간대별 참여 통계 뷰
CREATE OR REPLACE VIEW hourly_statistics AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    booth_id,
    COUNT(*) as participant_count
FROM participants
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), booth_id
ORDER BY hour DESC;
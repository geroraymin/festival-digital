-- ===================================================================
-- 부스 코드 시스템 데이터베이스 마이그레이션
-- 작성일: 2025-08-29
-- 설명: 부스 코드 기반 운영자 접속 시스템 구현
-- ===================================================================

-- 1. 부스 테이블에 코드 관련 필드 추가
-- ===================================================================
ALTER TABLE booths ADD COLUMN IF NOT EXISTS booth_code VARCHAR(6) UNIQUE;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMP;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS max_operators INTEGER DEFAULT 3;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS require_operator_info BOOLEAN DEFAULT true;

-- 부스 코드 인덱스 생성 (빠른 조회를 위해)
CREATE INDEX IF NOT EXISTS idx_booth_code ON booths(booth_code) WHERE booth_code IS NOT NULL;

-- 2. 부스 운영 기록 테이블
-- ===================================================================
CREATE TABLE IF NOT EXISTS booth_operations (
    id SERIAL PRIMARY KEY,
    booth_id INTEGER REFERENCES booths(id) ON DELETE CASCADE,
    operator_name VARCHAR(100) NOT NULL,
    operator_phone VARCHAR(20),
    operator_email VARCHAR(100),
    operator_organization VARCHAR(100),
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    total_participants INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_booth_operations_booth_id ON booth_operations(booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_operations_active ON booth_operations(is_active) WHERE is_active = true;

-- 3. 부스 코드 입력 시도 기록 (보안)
-- ===================================================================
CREATE TABLE IF NOT EXISTS code_attempts (
    id SERIAL PRIMARY KEY,
    attempted_code VARCHAR(6),
    ip_address VARCHAR(45),
    user_agent TEXT,
    attempted_at TIMESTAMP DEFAULT NOW(),
    success BOOLEAN DEFAULT false,
    booth_id INTEGER REFERENCES booths(id),
    error_message VARCHAR(255)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_code_attempts_ip ON code_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_code_attempts_time ON code_attempts(attempted_at);

-- 4. 운영자 세션 테이블 (임시 운영자 관리)
-- ===================================================================
CREATE TABLE IF NOT EXISTS operator_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(64) UNIQUE NOT NULL,
    booth_operation_id INTEGER REFERENCES booth_operations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_operator_sessions_token ON operator_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_expires ON operator_sessions(expires_at);

-- 5. 부스별 일일 통계 테이블 (빠른 조회용)
-- ===================================================================
CREATE TABLE IF NOT EXISTS booth_daily_stats (
    id SERIAL PRIMARY KEY,
    booth_id INTEGER REFERENCES booths(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    total_participants INTEGER DEFAULT 0,
    male_count INTEGER DEFAULT 0,
    female_count INTEGER DEFAULT 0,
    elementary_count INTEGER DEFAULT 0,
    middle_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    operator_count INTEGER DEFAULT 0,
    operation_hours DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(booth_id, stat_date)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_booth_daily_stats_date ON booth_daily_stats(stat_date);

-- 6. 실시간 통계 뷰 생성
-- ===================================================================
CREATE OR REPLACE VIEW booth_realtime_stats AS
SELECT 
    b.id as booth_id,
    b.name as booth_name,
    b.booth_code,
    b.is_active as booth_active,
    bo.id as operation_id,
    bo.operator_name,
    bo.operator_phone,
    bo.started_at,
    bo.is_active as operation_active,
    COUNT(DISTINCT p.id) as total_participants_today,
    COUNT(DISTINCT CASE WHEN p.created_at > bo.started_at THEN p.id END) as participants_this_session
FROM booths b
LEFT JOIN booth_operations bo ON b.id = bo.booth_id AND bo.is_active = true
LEFT JOIN participants p ON b.id = p.booth_id 
    AND DATE(p.created_at) = CURRENT_DATE
GROUP BY b.id, b.name, b.booth_code, b.is_active, 
         bo.id, bo.operator_name, bo.operator_phone, bo.started_at, bo.is_active;

-- 7. 운영자별 성과 뷰
-- ===================================================================
CREATE OR REPLACE VIEW operator_performance AS
SELECT 
    bo.operator_name,
    bo.operator_phone,
    b.name as booth_name,
    bo.started_at,
    bo.ended_at,
    CASE 
        WHEN bo.ended_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (bo.ended_at - bo.started_at))/3600
        ELSE EXTRACT(EPOCH FROM (NOW() - bo.started_at))/3600
    END as operation_hours,
    COUNT(p.id) as total_participants
FROM booth_operations bo
JOIN booths b ON bo.booth_id = b.id
LEFT JOIN participants p ON b.id = p.booth_id 
    AND p.created_at BETWEEN bo.started_at AND COALESCE(bo.ended_at, NOW())
GROUP BY bo.id, bo.operator_name, bo.operator_phone, b.name, bo.started_at, bo.ended_at;

-- 8. 보안 함수: IP별 시도 횟수 확인
-- ===================================================================
CREATE OR REPLACE FUNCTION check_ip_attempts(check_ip VARCHAR(45))
RETURNS INTEGER AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM code_attempts
    WHERE ip_address = check_ip
        AND attempted_at > NOW() - INTERVAL '1 hour'
        AND success = false;
    
    RETURN attempt_count;
END;
$$ LANGUAGE plpgsql;

-- 9. 보안 함수: 부스 코드 검증
-- ===================================================================
CREATE OR REPLACE FUNCTION validate_booth_code(
    input_code VARCHAR(6),
    input_ip VARCHAR(45)
)
RETURNS TABLE(
    is_valid BOOLEAN,
    booth_id INTEGER,
    booth_name VARCHAR,
    message VARCHAR
) AS $$
DECLARE
    v_booth_id INTEGER;
    v_booth_name VARCHAR;
    v_expires_at TIMESTAMP;
    v_is_active BOOLEAN;
    v_attempt_count INTEGER;
BEGIN
    -- IP 시도 횟수 확인
    v_attempt_count := check_ip_attempts(input_ip);
    
    IF v_attempt_count >= 5 THEN
        -- 시도 기록
        INSERT INTO code_attempts (attempted_code, ip_address, success, error_message)
        VALUES (input_code, input_ip, false, '시도 횟수 초과');
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR, '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.'::VARCHAR;
        RETURN;
    END IF;
    
    -- 부스 코드 확인
    SELECT b.id, b.name, b.code_expires_at, b.is_active
    INTO v_booth_id, v_booth_name, v_expires_at, v_is_active
    FROM booths b
    WHERE b.booth_code = input_code;
    
    IF v_booth_id IS NULL THEN
        -- 실패 기록
        INSERT INTO code_attempts (attempted_code, ip_address, success, error_message)
        VALUES (input_code, input_ip, false, '잘못된 코드');
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR, '잘못된 부스 코드입니다.'::VARCHAR;
        RETURN;
    END IF;
    
    -- 만료 확인
    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        -- 실패 기록
        INSERT INTO code_attempts (attempted_code, ip_address, success, booth_id, error_message)
        VALUES (input_code, input_ip, false, v_booth_id, '만료된 코드');
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR, '만료된 부스 코드입니다.'::VARCHAR;
        RETURN;
    END IF;
    
    -- 활성화 확인
    IF NOT v_is_active THEN
        -- 실패 기록
        INSERT INTO code_attempts (attempted_code, ip_address, success, booth_id, error_message)
        VALUES (input_code, input_ip, false, v_booth_id, '비활성 부스');
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR, '비활성화된 부스입니다.'::VARCHAR;
        RETURN;
    END IF;
    
    -- 성공 기록
    INSERT INTO code_attempts (attempted_code, ip_address, success, booth_id)
    VALUES (input_code, input_ip, true, v_booth_id);
    
    RETURN QUERY SELECT true, v_booth_id, v_booth_name, '부스 코드 확인 완료'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- 10. 트리거: booth_operations 업데이트 시간 자동 갱신
-- ===================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_booth_operations_updated_at
    BEFORE UPDATE ON booth_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 11. 트리거: 운영 종료시 일일 통계 업데이트
-- ===================================================================
CREATE OR REPLACE FUNCTION update_daily_stats_on_operation_end()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        -- 일일 통계 업데이트 또는 생성
        INSERT INTO booth_daily_stats (
            booth_id, 
            stat_date, 
            operator_count,
            operation_hours
        )
        VALUES (
            NEW.booth_id,
            DATE(NEW.started_at),
            1,
            EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))/3600
        )
        ON CONFLICT (booth_id, stat_date) DO UPDATE
        SET 
            operator_count = booth_daily_stats.operator_count + 1,
            operation_hours = booth_daily_stats.operation_hours + EXCLUDED.operation_hours,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_stats
    AFTER UPDATE ON booth_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats_on_operation_end();

-- 12. 샘플 데이터 (개발/테스트용)
-- ===================================================================
-- 샘플 부스 코드 생성 (기존 부스가 있는 경우)
UPDATE booths 
SET booth_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 3) || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0')),
    code_expires_at = NOW() + INTERVAL '30 days'
WHERE booth_code IS NULL;

-- 13. 정리 작업: 만료된 세션 자동 삭제 (크론잡 또는 스케줄러로 실행)
-- ===================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    -- 만료된 세션 삭제
    DELETE FROM operator_sessions WHERE expires_at < NOW();
    
    -- 오래된 시도 기록 삭제 (7일 이상)
    DELETE FROM code_attempts WHERE attempted_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 권한 설정 (Supabase RLS 정책을 위한 준비)
GRANT ALL ON booths TO authenticated;
GRANT ALL ON booth_operations TO authenticated;
GRANT ALL ON code_attempts TO authenticated;
GRANT ALL ON operator_sessions TO authenticated;
GRANT ALL ON booth_daily_stats TO authenticated;
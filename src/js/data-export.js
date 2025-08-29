/**
 * 데이터 내보내기 모듈
 * CSV 및 Excel 형식으로 데이터 다운로드
 */

import { supabase } from './supabase-client.js';

/**
 * CSV 문자열 생성
 */
function arrayToCSV(data, headers) {
    if (!data || data.length === 0) return '';
    
    // BOM 추가 (Excel에서 한글 깨짐 방지)
    const BOM = '\uFEFF';
    
    // 헤더 생성
    const csvHeaders = headers ? headers.join(',') : Object.keys(data[0]).join(',');
    
    // 데이터 행 생성
    const csvRows = data.map(row => {
        const values = headers 
            ? headers.map(header => {
                const value = row[header] || '';
                // 쉼표나 줄바꿈이 있으면 따옴표로 감싸기
                return typeof value === 'string' && (value.includes(',') || value.includes('\n'))
                    ? `"${value.replace(/"/g, '""')}"` 
                    : value;
              })
            : Object.values(row).map(value => {
                const val = value || '';
                return typeof val === 'string' && (val.includes(',') || val.includes('\n'))
                    ? `"${val.replace(/"/g, '""')}"` 
                    : val;
              });
        return values.join(',');
    });
    
    return BOM + csvHeaders + '\n' + csvRows.join('\n');
}

/**
 * 파일 다운로드 트리거
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 날짜 포맷팅
 */
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 참가자 데이터 내보내기
 */
export async function exportParticipants(options = {}) {
    try {
        const {
            boothId = null,
            startDate = null,
            endDate = null,
            format = 'csv'
        } = options;
        
        // 쿼리 생성
        let query = supabase
            .from('participants')
            .select(`
                *,
                booths (name)
            `)
            .order('created_at', { ascending: false });
        
        // 필터 적용
        if (boothId) {
            query = query.eq('booth_id', boothId);
        }
        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        if (endDate) {
            query = query.lte('created_at', endDate);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // 데이터 가공
        const exportData = data.map(item => ({
            '등록일시': formatDate(item.created_at),
            '부스명': item.booths?.name || '',
            '이름': item.name,
            '성별': item.gender,
            '학년': item.grade,
            '연락처': item.phone || '',
            '메시지': item.message || ''
        }));
        
        // 파일명 생성
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `participants_${dateStr}.${format}`;
        
        if (format === 'csv') {
            const csv = arrayToCSV(exportData);
            downloadFile(csv, filename, 'text/csv;charset=utf-8');
        }
        
        return {
            success: true,
            count: exportData.length,
            message: `${exportData.length}건의 데이터를 내보냈습니다.`
        };
    } catch (error) {
        console.error('참가자 데이터 내보내기 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 부스별 통계 내보내기
 */
export async function exportBoothStatistics(options = {}) {
    try {
        const { startDate = null, endDate = null } = options;
        
        // 부스 목록 가져오기
        const { data: booths } = await supabase
            .from('booths')
            .select('*')
            .order('name');
        
        if (!booths) throw new Error('부스 데이터를 가져올 수 없습니다.');
        
        // 각 부스별 통계 계산
        const statistics = await Promise.all(booths.map(async (booth) => {
            let query = supabase
                .from('participants')
                .select('*', { count: 'exact' })
                .eq('booth_id', booth.id);
            
            if (startDate) query = query.gte('created_at', startDate);
            if (endDate) query = query.lte('created_at', endDate);
            
            const { data: participants } = await query;
            
            // 성별 통계
            const maleCount = participants?.filter(p => p.gender === '남').length || 0;
            const femaleCount = participants?.filter(p => p.gender === '여').length || 0;
            
            // 학년별 통계
            const elementary = participants?.filter(p => p.grade === '초등학생').length || 0;
            const middle = participants?.filter(p => p.grade === '중학생').length || 0;
            const high = participants?.filter(p => p.grade === '고등학생').length || 0;
            
            return {
                '부스명': booth.name,
                '부스코드': booth.booth_code || '',
                '총 참가자': participants?.length || 0,
                '남성': maleCount,
                '여성': femaleCount,
                '초등학생': elementary,
                '중학생': middle,
                '고등학생': high,
                '상태': booth.is_active ? '활성' : '비활성'
            };
        }));
        
        // 파일명 생성
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `booth_statistics_${dateStr}.csv`;
        
        // CSV 생성 및 다운로드
        const csv = arrayToCSV(statistics);
        downloadFile(csv, filename, 'text/csv;charset=utf-8');
        
        return {
            success: true,
            count: statistics.length,
            message: `${statistics.length}개 부스의 통계를 내보냈습니다.`
        };
    } catch (error) {
        console.error('부스 통계 내보내기 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 운영자별 실적 내보내기
 */
export async function exportOperatorPerformance(options = {}) {
    try {
        const { startDate = null, endDate = null } = options;
        
        // 운영 기록 가져오기
        let query = supabase
            .from('booth_operations')
            .select(`
                *,
                booths (name)
            `)
            .order('started_at', { ascending: false });
        
        if (startDate) query = query.gte('started_at', startDate);
        if (endDate) query = query.lte('ended_at', endDate);
        
        const { data: operations } = await query;
        
        if (!operations) throw new Error('운영 데이터를 가져올 수 없습니다.');
        
        // 각 운영별 실적 계산
        const performance = await Promise.all(operations.map(async (op) => {
            // 해당 운영 시간 동안의 참가자 수 계산
            let participantQuery = supabase
                .from('participants')
                .select('*', { count: 'exact' })
                .eq('booth_id', op.booth_id)
                .gte('created_at', op.started_at);
            
            if (op.ended_at) {
                participantQuery = participantQuery.lte('created_at', op.ended_at);
            }
            
            const { data: participants } = await participantQuery;
            
            // 운영 시간 계산 (분)
            const startTime = new Date(op.started_at);
            const endTime = op.ended_at ? new Date(op.ended_at) : new Date();
            const operationMinutes = Math.floor((endTime - startTime) / 1000 / 60);
            
            return {
                '부스명': op.booths?.name || '',
                '운영자명': op.operator_name,
                '연락처': op.operator_phone || '',
                '시작시간': formatDate(op.started_at),
                '종료시간': op.ended_at ? formatDate(op.ended_at) : '운영중',
                '운영시간(분)': operationMinutes,
                '참가자수': participants?.length || 0,
                '시간당참가자': operationMinutes > 0 ? 
                    ((participants?.length || 0) / operationMinutes * 60).toFixed(1) : '0'
            };
        }));
        
        // 파일명 생성
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `operator_performance_${dateStr}.csv`;
        
        // CSV 생성 및 다운로드
        const csv = arrayToCSV(performance);
        downloadFile(csv, filename, 'text/csv;charset=utf-8');
        
        return {
            success: true,
            count: performance.length,
            message: `${performance.length}건의 운영 실적을 내보냈습니다.`
        };
    } catch (error) {
        console.error('운영 실적 내보내기 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 종합 보고서 내보내기 (여러 시트를 하나의 파일로)
 */
export async function exportComprehensiveReport(options = {}) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // 1. 참가자 데이터 내보내기
        await exportParticipants({ ...options, format: 'csv' });
        
        // 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 2. 부스 통계 내보내기
        await exportBoothStatistics(options);
        
        // 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 3. 운영자 실적 내보내기
        await exportOperatorPerformance(options);
        
        return {
            success: true,
            message: '종합 보고서 3개 파일이 다운로드되었습니다.'
        };
    } catch (error) {
        console.error('종합 보고서 내보내기 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 간단한 요약 통계 내보내기
 */
export async function exportSummary() {
    try {
        const { data: participants } = await supabase
            .from('participants')
            .select('*');
        
        const { data: booths } = await supabase
            .from('booths')
            .select('*');
        
        const { data: operations } = await supabase
            .from('booth_operations')
            .select('*');
        
        const today = new Date().toISOString().split('T')[0];
        const todayParticipants = participants?.filter(p => 
            p.created_at.startsWith(today)
        ).length || 0;
        
        const summary = [
            { '항목': '전체 부스 수', '값': booths?.length || 0 },
            { '항목': '활성 부스 수', '값': booths?.filter(b => b.is_active).length || 0 },
            { '항목': '전체 참가자 수', '값': participants?.length || 0 },
            { '항목': '오늘 참가자 수', '값': todayParticipants },
            { '항목': '남성 참가자', '값': participants?.filter(p => p.gender === '남').length || 0 },
            { '항목': '여성 참가자', '값': participants?.filter(p => p.gender === '여').length || 0 },
            { '항목': '초등학생', '값': participants?.filter(p => p.grade === '초등학생').length || 0 },
            { '항목': '중학생', '값': participants?.filter(p => p.grade === '중학생').length || 0 },
            { '항목': '고등학생', '값': participants?.filter(p => p.grade === '고등학생').length || 0 },
            { '항목': '총 운영 횟수', '값': operations?.length || 0 },
            { '항목': '현재 운영 중', '값': operations?.filter(o => o.is_active).length || 0 }
        ];
        
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `summary_${dateStr}.csv`;
        
        const csv = arrayToCSV(summary);
        downloadFile(csv, filename, 'text/csv;charset=utf-8');
        
        return {
            success: true,
            message: '요약 통계를 내보냈습니다.'
        };
    } catch (error) {
        console.error('요약 통계 내보내기 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
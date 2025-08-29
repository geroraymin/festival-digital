/**
 * 통합 권한 관리 모듈
 * 관리자, 운영자, 일반 사용자 권한 체크
 */

import { getOperatorSession } from './operator-auth.js';

// 사용자 역할 정의
export const USER_ROLES = {
    ADMIN: 'admin',
    OPERATOR: 'operator',
    GUEST: 'guest'
};

// 권한 레벨 정의
export const PERMISSIONS = {
    // 관리자 권한
    MANAGE_BOOTHS: 'manage_booths',
    MANAGE_CODES: 'manage_codes',
    VIEW_ALL_STATS: 'view_all_stats',
    EXPORT_DATA: 'export_data',
    
    // 운영자 권한
    OPERATE_BOOTH: 'operate_booth',
    VIEW_BOOTH_STATS: 'view_booth_stats',
    ADD_PARTICIPANT: 'add_participant',
    
    // 공통 권한
    VIEW_PUBLIC: 'view_public'
};

// 역할별 권한 매핑
const ROLE_PERMISSIONS = {
    [USER_ROLES.ADMIN]: [
        PERMISSIONS.MANAGE_BOOTHS,
        PERMISSIONS.MANAGE_CODES,
        PERMISSIONS.VIEW_ALL_STATS,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.OPERATE_BOOTH,
        PERMISSIONS.VIEW_BOOTH_STATS,
        PERMISSIONS.ADD_PARTICIPANT,
        PERMISSIONS.VIEW_PUBLIC
    ],
    [USER_ROLES.OPERATOR]: [
        PERMISSIONS.OPERATE_BOOTH,
        PERMISSIONS.VIEW_BOOTH_STATS,
        PERMISSIONS.ADD_PARTICIPANT,
        PERMISSIONS.VIEW_PUBLIC
    ],
    [USER_ROLES.GUEST]: [
        PERMISSIONS.VIEW_PUBLIC
    ]
};

/**
 * 현재 사용자의 역할 가져오기
 */
export function getCurrentUserRole() {
    // 관리자 세션 확인
    const adminSession = localStorage.getItem('admin_session');
    if (adminSession) {
        try {
            const session = JSON.parse(adminSession);
            if (session.role === 'admin') {
                return USER_ROLES.ADMIN;
            }
        } catch (e) {
            console.error('관리자 세션 파싱 실패:', e);
        }
    }
    
    // 운영자 세션 확인
    const operatorSession = getOperatorSession();
    if (operatorSession && operatorSession.role === 'operator') {
        return USER_ROLES.OPERATOR;
    }
    
    // 기본값: 게스트
    return USER_ROLES.GUEST;
}

/**
 * 현재 사용자 정보 가져오기
 */
export function getCurrentUser() {
    const role = getCurrentUserRole();
    
    if (role === USER_ROLES.ADMIN) {
        const adminSession = JSON.parse(localStorage.getItem('admin_session') || '{}');
        return {
            role: USER_ROLES.ADMIN,
            username: adminSession.username,
            name: '관리자',
            boothId: null, // 관리자는 모든 부스 접근 가능
            permissions: ROLE_PERMISSIONS[USER_ROLES.ADMIN]
        };
    }
    
    if (role === USER_ROLES.OPERATOR) {
        const operatorSession = getOperatorSession();
        return {
            role: USER_ROLES.OPERATOR,
            username: operatorSession.operatorName,
            name: operatorSession.operatorName,
            boothId: operatorSession.boothId,
            boothName: operatorSession.boothName,
            permissions: ROLE_PERMISSIONS[USER_ROLES.OPERATOR]
        };
    }
    
    return {
        role: USER_ROLES.GUEST,
        username: 'guest',
        name: '방문자',
        boothId: null,
        permissions: ROLE_PERMISSIONS[USER_ROLES.GUEST]
    };
}

/**
 * 특정 권한 체크
 */
export function hasPermission(permission) {
    const user = getCurrentUser();
    return user.permissions.includes(permission);
}

/**
 * 여러 권한 중 하나라도 있는지 체크
 */
export function hasAnyPermission(permissions) {
    const user = getCurrentUser();
    return permissions.some(permission => user.permissions.includes(permission));
}

/**
 * 모든 권한이 있는지 체크
 */
export function hasAllPermissions(permissions) {
    const user = getCurrentUser();
    return permissions.every(permission => user.permissions.includes(permission));
}

/**
 * 특정 부스에 대한 접근 권한 체크
 */
export function canAccessBooth(boothId) {
    const user = getCurrentUser();
    
    // 관리자는 모든 부스 접근 가능
    if (user.role === USER_ROLES.ADMIN) {
        return true;
    }
    
    // 운영자는 자신이 운영하는 부스만 접근 가능
    if (user.role === USER_ROLES.OPERATOR) {
        return user.boothId === boothId;
    }
    
    // 게스트는 부스 운영 불가
    return false;
}

/**
 * 관리자인지 확인
 */
export function isAdmin() {
    return getCurrentUserRole() === USER_ROLES.ADMIN;
}

/**
 * 운영자인지 확인
 */
export function isOperator() {
    return getCurrentUserRole() === USER_ROLES.OPERATOR;
}

/**
 * 로그인 여부 확인
 */
export function isLoggedIn() {
    const role = getCurrentUserRole();
    return role === USER_ROLES.ADMIN || role === USER_ROLES.OPERATOR;
}

/**
 * 권한 없음 메시지 표시
 */
export function showUnauthorizedMessage(requiredPermission) {
    const messages = {
        [PERMISSIONS.MANAGE_BOOTHS]: '부스 관리 권한이 필요합니다.',
        [PERMISSIONS.MANAGE_CODES]: '부스 코드 관리 권한이 필요합니다.',
        [PERMISSIONS.VIEW_ALL_STATS]: '전체 통계 조회 권한이 필요합니다.',
        [PERMISSIONS.EXPORT_DATA]: '데이터 내보내기 권한이 필요합니다.',
        [PERMISSIONS.OPERATE_BOOTH]: '부스 운영 권한이 필요합니다.',
        [PERMISSIONS.VIEW_BOOTH_STATS]: '부스 통계 조회 권한이 필요합니다.',
        [PERMISSIONS.ADD_PARTICIPANT]: '참가자 등록 권한이 필요합니다.'
    };
    
    const message = messages[requiredPermission] || '이 기능을 사용할 권한이 없습니다.';
    alert(message);
}

/**
 * 권한 체크 데코레이터 (함수 래퍼)
 */
export function requirePermission(permission) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function(...args) {
            if (!hasPermission(permission)) {
                showUnauthorizedMessage(permission);
                return null;
            }
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}

/**
 * UI 요소 권한별 표시/숨김
 */
export function updateUIByPermissions() {
    const user = getCurrentUser();
    
    // 관리자 전용 요소
    document.querySelectorAll('[data-require-admin]').forEach(element => {
        element.style.display = user.role === USER_ROLES.ADMIN ? '' : 'none';
    });
    
    // 운영자 이상 권한 요소
    document.querySelectorAll('[data-require-operator]').forEach(element => {
        element.style.display = (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.OPERATOR) ? '' : 'none';
    });
    
    // 로그인 필수 요소
    document.querySelectorAll('[data-require-login]').forEach(element => {
        element.style.display = isLoggedIn() ? '' : 'none';
    });
    
    // 비로그인 전용 요소
    document.querySelectorAll('[data-require-guest]').forEach(element => {
        element.style.display = !isLoggedIn() ? '' : 'none';
    });
    
    // 특정 권한별 요소
    Object.values(PERMISSIONS).forEach(permission => {
        document.querySelectorAll(`[data-require-permission="${permission}"]`).forEach(element => {
            element.style.display = hasPermission(permission) ? '' : 'none';
        });
    });
}

/**
 * 페이지 접근 권한 체크
 */
export function checkPageAccess(requiredRole = USER_ROLES.GUEST) {
    const currentRole = getCurrentUserRole();
    
    // 권한 레벨 체크 (Admin > Operator > Guest)
    const roleLevel = {
        [USER_ROLES.ADMIN]: 3,
        [USER_ROLES.OPERATOR]: 2,
        [USER_ROLES.GUEST]: 1
    };
    
    if (roleLevel[currentRole] < roleLevel[requiredRole]) {
        // 권한 부족
        alert('이 페이지에 접근할 권한이 없습니다.');
        
        // 적절한 페이지로 리다이렉트
        if (currentRole === USER_ROLES.GUEST) {
            window.location.href = 'operator-login.html';
        } else {
            window.location.href = 'index.html';
        }
        return false;
    }
    
    return true;
}

/**
 * 로그아웃
 */
export function logout() {
    const user = getCurrentUser();
    
    if (user.role === USER_ROLES.ADMIN) {
        localStorage.removeItem('admin_session');
        window.location.href = 'admin-login.html';
    } else if (user.role === USER_ROLES.OPERATOR) {
        // operator-auth 모듈의 로그아웃 함수 호출
        import('./operator-auth.js').then(module => {
            module.operatorLogout().then(() => {
                window.location.href = 'operator-login.html';
            });
        });
    } else {
        window.location.href = 'index.html';
    }
}
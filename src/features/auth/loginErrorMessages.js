const normalizeClerkSignInError = (error) => {
  const detail = Array.isArray(error?.errors) ? error.errors[0] : null;
  return Object.freeze({
    code: String(detail?.code || error?.code || '').trim(),
    field: String(detail?.meta?.name || error?.meta?.name || '').trim(),
  });
};

export const getClerkPasswordSignInErrorMessage = (error) => {
  const { code, field } = normalizeClerkSignInError(error);

  if (code === 'form_identifier_not_found') {
    return '입력한 이메일로 등록된 로그인 계정을 찾을 수 없습니다. 이메일 주소를 확인해 주세요.';
  }

  if (code === 'form_password_incorrect') {
    return '비밀번호가 올바르지 않습니다. 비밀번호를 다시 확인해 주세요.';
  }

  if (code === 'form_password_or_identifier_incorrect') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (
    code === 'form_param_format_invalid' &&
    (!field || ['identifier', 'email_address', 'emailAddress'].includes(field))
  ) {
    return '이메일 형식이 올바르지 않습니다.';
  }

  return '';
};

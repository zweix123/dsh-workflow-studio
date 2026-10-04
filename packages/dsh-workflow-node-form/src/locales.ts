export const en = {
  formOpen: 'Fill in',
  formSubmit: 'Submit form',
  formSubmitted: 'Submitted. The result is read-only.',
  formChoose: 'Choose',
  formPrefillInvalid: 'Upstream prefill has the wrong type',
  formRetry: 'Retry result delivery',
}

export const zh = {
  formOpen: '填写',
  formSubmit: '提交表单',
  formSubmitted: '已提交，结果只读。',
  formChoose: '请选择',
  formPrefillInvalid: '上游预填类型不匹配',
  formRetry: '重试提交结果',
}

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { '@dsh-workflow/node-form': keyof typeof en } }

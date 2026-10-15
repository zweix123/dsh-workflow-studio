export const en = {
  formOpen: 'Fill in',
  formClose: 'Close form',
  formAdd: 'Add',
  formRemove: 'Remove',
  formSubmit: 'Submit form',
  formSubmitted: 'Submitted. The result is read-only.',
  formChoose: 'Choose',
  formPrefillInvalid: 'Upstream prefill has the wrong type',
  formRetry: 'Retry delivery',
}

export const zh = {
  formOpen: '填写',
  formClose: '关闭表单',
  formAdd: '添加',
  formRemove: '删除',
  formSubmit: '提交表单',
  formSubmitted: '已提交，结果只读。',
  formChoose: '请选择',
  formPrefillInvalid: '上游预填类型不匹配',
  formRetry: '重试交付',
}

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { '@dsh-workflow/node-form': keyof typeof en } }

import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface CustomFieldDefinition {
  id: string
  fieldKey: string
  label: string
  fieldType: 'text' | 'text_long' | 'integer' | 'decimal' | 'boolean' | 'date' | 'url' | 'json'
  uiVisibility: 'always' | 'if_set' | 'hidden'
  description?: string | null
  required: boolean
  defaultValue?: unknown
  createdAt: string
  updatedAt: string
}

export function useCustomFields() {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields'],
    queryFn: () => api.get('api/custom-fields').json<CustomFieldDefinition[]>(),
  })
}

export function useCreateCustomField() {
  return useMutation({
    mutationFn: (data: {
      fieldKey: string
      label: string
      fieldType?: CustomFieldDefinition['fieldType']
      uiVisibility?: CustomFieldDefinition['uiVisibility']
      description?: string
      required?: boolean
    }) => api.post('api/custom-fields', { json: data }).json<CustomFieldDefinition>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] })
    },
  })
}

export function useDeleteCustomField() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`api/custom-fields/${id}`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] })
    },
  })
}

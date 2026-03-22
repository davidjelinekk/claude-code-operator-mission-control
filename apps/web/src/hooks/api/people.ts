import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export interface Person {
  id: string
  name: string
  email?: string
  phone?: string
  source: 'telegram' | 'teams' | 'email' | 'manual' | 'form'
  externalId?: string
  avatarUrl?: string
  notes?: string
  tags: string[]
  role?: string
  relationship?: string
  priorities: string[]
  context?: string
  channelHandles: Record<string, string>
  createdAt: string
  updatedAt: string
  threadCount?: number
  lastActiveAt?: string
}

export const SOURCE_STYLES: Record<Person['source'], string> = {
  telegram: 'text-[#58a6ff] border-[#1f6feb]',
  teams: 'text-[#a5a0ff] border-[#6e40c9]',
  email: 'text-[#8b949e] border-[#30363d]',
  manual: 'text-[#3fb950] border-[#238636]',
  form: 'text-[#d29922] border-[#9e6a03]',
}

export interface PersonThread {
  id: string
  personId: string
  agentId: string
  channel: 'telegram' | 'teams' | 'email' | 'other'
  threadId?: string
  summary?: string
  lastMessageAt?: string
  createdAt: string
}

export interface LinkedTask {
  id: string
  title: string
  status: string
  priority: string
  boardId: string
}

export interface PersonDetail {
  person: Person
  threads: PersonThread[]
  tasks: Array<{ task: LinkedTask | null; boardName: string | null }>
  projects: Array<{ project: { id: string; name: string; status: string; progressPct: number } | null }>
}

export function usePeople() {
  return useQuery<Person[]>({ queryKey: ['people'], queryFn: () => api.get('api/people').json<Person[]>() })
}

export function usePerson(id: string) {
  return useQuery<PersonDetail>({ queryKey: ['people', id], queryFn: () => api.get(`api/people/${id}`).json<PersonDetail>() })
}

export function useCreatePerson() {
  return useMutation({
    mutationFn: (data: Omit<Partial<Person>, 'id' | 'createdAt' | 'updatedAt' | 'threadCount' | 'lastActiveAt'> & { name: string }) =>
      api.post('api/people', { json: data }).json<Person>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })
}

export function useUpdatePerson(id: string) {
  return useMutation({
    mutationFn: (data: Partial<Person>) => api.patch(`api/people/${id}`, { json: data }).json<Person>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', id] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

export function useDeletePerson() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`api/people/${id}`).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })
}

export function useAddPersonThread(personId: string) {
  return useMutation({
    mutationFn: (data: { agentId: string; channel: PersonThread['channel']; summary?: string; threadId?: string }) =>
      api.post(`api/people/${personId}/threads`, { json: data }).json<PersonThread>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people', personId] }),
  })
}

export function useLinkPersonTask(personId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`api/people/${personId}/tasks`, { json: { taskId } }).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people', personId] }),
  })
}

export function useUnlinkPersonTask(personId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.delete(`api/people/${personId}/tasks/${taskId}`).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people', personId] }),
  })
}

export function useLinkPersonProject(personId: string) {
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post(`api/people/${personId}/projects`, { json: { projectId } }).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people', personId] }),
  })
}

export function usePeopleTasks(personId: string) {
  return useQuery<Array<{ task: LinkedTask | null; boardName: string | null }>>({
    queryKey: ['people', personId, 'tasks'],
    queryFn: () => api.get(`api/people/${personId}/tasks`).json<Array<{ task: LinkedTask | null; boardName: string | null }>>(),
  })
}

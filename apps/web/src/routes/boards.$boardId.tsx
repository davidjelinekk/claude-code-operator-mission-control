import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/boards/$boardId')({
  component: () => <Outlet />,
})

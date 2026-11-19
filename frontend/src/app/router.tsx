import { createRootRoute, createRoute, createRouter, Navigate, Outlet, RouterProvider, useNavigate } from "@tanstack/react-router"
import { useEffect, type ReactNode } from "react"

import { ChangePasswordPage } from "../features/auth/ChangePasswordPage"
import { LoginPage } from "../features/auth/LoginPage"
import { useAuth } from "../features/auth/AuthContext"
import { ProfilePage } from "../features/profile/ProfilePage"
import { AdminUsersPage } from "../features/users/AdminUsersPage"
import { CareersPage, FacultiesPage, SubjectsPage } from "../features/curriculum/CatalogPages"
import { PlansPage } from "../features/curriculum/PlansPage"
import { PeriodsPage } from "../features/periods/PeriodsPage"
import { ParallelsPage } from "../features/parallel/ParallelsPage"
import { AuthorizationsPage } from "../features/enrollments/AuthorizationsPage"
import { StudentOfferPage } from "../features/enrollments/StudentOfferPage"
import { TeacherGradesPage } from "../features/grades/TeacherGradesPage"
import { StudentGradesPage } from "../features/grades/StudentGradesPage"
import { ReportsPage } from "../features/reports/ReportsPage"
import { DashboardPage } from "../features/dashboard/DashboardPage"

function RootLayout() {
  return <Outlet />
}

function Protected({ children, allowPasswordChange = false, adminOnly = false, studentOnly = false, teacherOnly = false }: { children: ReactNode; allowPasswordChange?: boolean; adminOnly?: boolean; studentOnly?: boolean; teacherOnly?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="simple-page"><p className="loading-copy">Comprobando sesión…</p></main>
  if (!user) return <Navigate to="/login" />
  if (user.debe_cambiar_contrasena && !allowPasswordChange) return <Navigate to="/cambiar-contrasena" />
  if (adminOnly && user.rol !== "ADMINISTRADOR") return <Navigate to="/perfil" />
  if (studentOnly && user.rol !== "ESTUDIANTE") return <Navigate to="/perfil" />
  if (teacherOnly && user.rol !== "DOCENTE") return <Navigate to="/perfil" />
  return children
}

function HomeRoute() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) return
    if (!user) void navigate({ to: "/login" })
    else if (user.debe_cambiar_contrasena) void navigate({ to: "/cambiar-contrasena" })
    else void navigate({ to: "/dashboard" })
  }, [loading, user, navigate])
  return <main className="simple-page"><p className="loading-copy">Abriendo tu cuenta…</p></main>
}

function ProfileRoute() {
  return <Protected><ProfilePage /></Protected>
}

function ChangePasswordRoute() {
  return <Protected allowPasswordChange><ChangePasswordPage /></Protected>
}

function UsersRoute() {
  return <Protected adminOnly><AdminUsersPage /></Protected>
}

function CareersRoute() {
  return <Protected adminOnly><CareersPage /></Protected>
}

function FacultiesRoute() {
  return <Protected adminOnly><FacultiesPage /></Protected>
}

function SubjectsRoute() {
  return <Protected adminOnly><SubjectsPage /></Protected>
}

function PlansRoute() {
  return <Protected adminOnly><PlansPage /></Protected>
}

function PeriodsRoute() {
  return <Protected adminOnly><PeriodsPage /></Protected>
}

function ParallelsRoute() {
  return <Protected adminOnly><ParallelsPage /></Protected>
}

function AuthorizationsRoute() {
  return <Protected adminOnly><AuthorizationsPage /></Protected>
}

function StudentOfferRoute() {
  return <Protected studentOnly><StudentOfferPage /></Protected>
}

function TeacherGradesRoute() {
  return <Protected teacherOnly><TeacherGradesPage /></Protected>
}

function StudentGradesRoute() {
  return <Protected studentOnly><StudentGradesPage /></Protected>
}

function ReportsRoute() {
  return <Protected><ReportsPage /></Protected>
}

function DashboardRoute() {
  return <Protected><DashboardPage /></Protected>
}

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomeRoute })
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage })
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/perfil", component: ProfileRoute })
const changePasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cambiar-contrasena", component: ChangePasswordRoute })
const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/usuarios", component: UsersRoute })
const careersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/carreras", component: CareersRoute })
const facultiesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/facultades", component: FacultiesRoute })
const subjectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/materias", component: SubjectsRoute })
const plansRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/planes", component: PlansRoute })
const periodsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/periodos", component: PeriodsRoute })
const parallelsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/paralelos", component: ParallelsRoute })
const authorizationsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/habilitaciones", component: AuthorizationsRoute })
const studentOfferRoute = createRoute({ getParentRoute: () => rootRoute, path: "/estudiante/oferta", component: StudentOfferRoute })
const teacherGradesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/docente/calificaciones", component: TeacherGradesRoute })
const studentGradesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/estudiante/calificaciones", component: StudentGradesRoute })
const reportsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reportes", component: ReportsRoute })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: DashboardRoute })
const routeTree = rootRoute.addChildren([indexRoute, loginRoute, profileRoute, changePasswordRoute, usersRoute, careersRoute, facultiesRoute, subjectsRoute, plansRoute, periodsRoute, parallelsRoute, authorizationsRoute, studentOfferRoute, teacherGradesRoute, studentGradesRoute, reportsRoute, dashboardRoute])
const router = createRouter({ routeTree })

export function AppRouter() {
  return <RouterProvider router={router} />
}

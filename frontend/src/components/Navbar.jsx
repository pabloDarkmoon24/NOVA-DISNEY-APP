import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, History, LogOut, Zap, BarChart2, Settings, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <nav className="navbar">
      <NavLink to="/dashboard" className="navbar-brand">
        <div className="navbar-logo">N</div>
        <span className="navbar-title">Nova Panel</span>
      </NavLink>

      <div className="navbar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={15} />
          Dashboard
        </NavLink>

        <NavLink
          to="/quick"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <Zap size={15} />
          Masivo Rápido
        </NavLink>

        <NavLink
          to="/bulk"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <Layers size={15} />
          Masivo Excel
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <History size={15} />
          Historial
        </NavLink>

        <NavLink
          to="/traceability"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <BarChart2 size={15} />
          Trazabilidad
        </NavLink>
      </div>

      <div className="navbar-right">
        <div className="navbar-user">
          <div className="navbar-avatar">{initials}</div>
          <span className="navbar-user-name">{user?.name}</span>
        </div>

        {/* Configuración — icono discreto, sin etiqueta */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `btn btn-secondary btn-sm btn-icon ${isActive ? 'active' : ''}`
          }
          title="Configuración"
          style={({ isActive }) => isActive ? { color: 'var(--color-primary)', borderColor: 'rgba(34,197,94,0.3)' } : {}}
        >
          <Settings size={15} />
        </NavLink>

        <button
          className="btn btn-secondary btn-sm btn-icon"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <LogOut size={15} />
        </button>
      </div>
    </nav>
  );
}

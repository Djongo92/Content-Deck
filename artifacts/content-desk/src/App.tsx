import { ReactNode } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout';

import Home from '@/pages/home';
import CalendarPage from '@/pages/calendar';
import ClientsPage from '@/pages/clients';
import AssetsPage from '@/pages/assets';
import ReportsPage from '@/pages/reports';
import LaunchPage from '@/pages/launch';

function Router() {
  return (
    <AppLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/clients" component={ClientsPage} />
          <Route path="/assets" component={AssetsPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/launch" component={LaunchPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppLayout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;

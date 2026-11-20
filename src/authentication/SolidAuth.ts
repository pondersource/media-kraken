import { Fetch } from 'soukai-solid';
import { SolidUserProfile } from '@noeldemartin/solid-utils';
import SolidUser from '@/models/users/SolidUser';
import { AuthenticationMethod, AuthenticationStatus } from '@/authentication';

export type SolidAuthPreviousLogin = {
    loginUrl: string;
    authenticationMethod: AuthenticationMethod;
};
export interface SolidAuthSessionListener {
    onUserUpdated(user: SolidUser | null): void;
    onError(error: Error): void;
}

/** Compatibility facade for the model and worker layers; all I/O belongs to the movies rs.js module. */
class SolidAuth {

    private _fetch?: Fetch;
    private webId: string | null = null;

    public get fetch(): Fetch {
        return this._fetch || window.ponderStorage.fetch;
    }

    public get previousLogin(): SolidAuthPreviousLogin | null {
        return null;
    }

    public setFetch(fetch: Fetch): void {
        this._fetch = fetch;
    }

    public async boot(listener: SolidAuthSessionListener): Promise<void> {
        const update = (profile: SolidUserProfile | null) => {
            if (profile && profile.webId === this.webId) return;
            this.webId = profile ? profile.webId : null;
            listener.onUserUpdated(profile ? new SolidUser(profile) : null);
        };
        this.setFetch(window.ponderStorage.fetch);
        window.ponderStorage.onUser(update);
        try {
            update(await window.ponderStorage.restore());
        } catch (error) {
            listener.onError(error);
        }
    }

    public async login(_loginUrl: string, _authenticationMethod?: AuthenticationMethod): Promise<AuthenticationStatus> {
        void _loginUrl;
        void _authenticationMethod;
        window.ponderStorage.open();
        return AuthenticationStatus.LoggingIn;
    }

    public async logout(): Promise<void> {
        window.ponderStorage.disconnect();
    }

}
export default new SolidAuth();

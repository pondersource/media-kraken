import { SolidUserProfile } from '@noeldemartin/solid-utils';
declare global {
    interface Window {
        ponderStorage: {
            fetch: typeof fetch;
            open(): void;
            disconnect(): void;
            restore(): Promise<SolidUserProfile | null>;
            onUser(callback: (user: SolidUserProfile | null) => void): () => void;
        };
    }
}

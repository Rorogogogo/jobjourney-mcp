export function startSignalRSupervisor(connect, options = {}) {
    const retryDelayMs = options.retryDelayMs ?? 30_000;
    const logError = options.logError ?? (() => { });
    let stopped = false;
    let activeConnection = null;
    let retryTimer = null;
    let connectInFlight = null;
    const clearRetryTimer = () => {
        if (!retryTimer) {
            return;
        }
        clearTimeout(retryTimer);
        retryTimer = null;
    };
    const scheduleRetry = () => {
        if (stopped || retryTimer || connectInFlight) {
            return;
        }
        retryTimer = setTimeout(() => {
            retryTimer = null;
            void ensureConnected();
        }, retryDelayMs);
    };
    const ensureConnected = async () => {
        if (stopped || connectInFlight || activeConnection) {
            return;
        }
        connectInFlight = (async () => {
            let shouldRetry = false;
            try {
                const connection = await connect();
                if (stopped) {
                    await connection.stop();
                    return;
                }
                activeConnection = connection;
                connection.onclose(() => {
                    if (activeConnection !== connection) {
                        return;
                    }
                    activeConnection = null;
                    scheduleRetry();
                });
            }
            catch (error) {
                logError(error);
                shouldRetry = true;
            }
            finally {
                connectInFlight = null;
                if (shouldRetry) {
                    scheduleRetry();
                }
            }
        })();
        await connectInFlight;
    };
    void ensureConnected();
    return {
        async stop() {
            stopped = true;
            clearRetryTimer();
            const connection = activeConnection;
            activeConnection = null;
            if (connection) {
                await connection.stop();
            }
        },
    };
}

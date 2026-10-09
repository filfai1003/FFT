# Builds the Android APK locally (no Expo cloud queue): JDK 17 + Android SDK + Node.
FROM eclipse-temurin:17-jdk-jammy
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip git python3 make g++ xz-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android
ENV ANDROID_SDK_ROOT=/opt/android
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && cd /tmp \
 && curl -fsSL -o tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && unzip -q tools.zip \
 && mv cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm tools.zip
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
RUN yes | sdkmanager --licenses > /dev/null \
 && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
RUN curl -fsSL https://nodejs.org/dist/v24.11.0/node-v24.11.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
WORKDIR /work

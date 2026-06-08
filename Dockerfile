# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# --- Restore .NET packages (cached unless a .csproj changes) ---
COPY Binner/CommonSettings.targets .
COPY Binner/Binner.Web/Binner.Web.csproj                                                                        Binner.Web/
COPY Binner/Library/Binner.Common/Binner.Common.csproj                                                          Library/Binner.Common/
COPY Binner/Library/Binner.Model/Binner.Model.csproj                                                            Library/Binner.Model/
COPY Binner/Library/Binner.Services/Binner.Services.csproj                                                      Library/Binner.Services/
COPY Binner/Library/Binner.Global.Common/Binner.Global.Common.csproj                                            Library/Binner.Global.Common/
COPY Binner/Library/Binner.Legacy/Binner.Legacy.csproj                                                          Library/Binner.Legacy/
COPY Binner/Library/Nexar.Client/Nexar.Client.csproj                                                            Library/Nexar.Client/
COPY Binner/Library/Binner.Services/Integrations/DigikeyClient/ApiClient.csproj                                 Library/Binner.Services/Integrations/DigikeyClient/
COPY Binner/Data/Binner.Data/Binner.Data.csproj                                                                 Data/Binner.Data/
COPY Binner/Data/Binner.Data.Model/Binner.Data.Model.csproj                                                     Data/Binner.Data.Model/
COPY Binner/Data/Binner.Data.Stub/Binner.Data.Stub.csproj                                                       Data/Binner.Data.Stub/
COPY Binner/Data/Binner.Data.Migrations.MySql/Binner.Data.Migrations.MySql.csproj                               Data/Binner.Data.Migrations.MySql/
COPY Binner/Data/Binner.Data.Migrations.Postgresql/Binner.Data.Migrations.Postgresql.csproj                     Data/Binner.Data.Migrations.Postgresql/
COPY Binner/Data/Binner.Data.Migrations.Sqlite/Binner.Data.Migrations.Sqlite.csproj                             Data/Binner.Data.Migrations.Sqlite/
COPY Binner/Data/Binner.Data.Migrations.SqlServer/Binner.Data.Migrations.SqlServer.csproj                       Data/Binner.Data.Migrations.SqlServer/
COPY Binner/Data/Binner.StorageProvider.EntityFrameworkCore/Binner.StorageProvider.EntityFrameworkCore.csproj   Data/Binner.StorageProvider.EntityFrameworkCore/
COPY Binner/External/barcoder/Barcoder.Renderer.Image/Barcoder.Renderer.Image.csproj                            External/barcoder/Barcoder.Renderer.Image/

RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore Binner.Web/Binner.Web.csproj -r linux-arm64

# --- Install npm packages (cached unless package-lock.json changes) ---
COPY Binner/Binner.Web/ClientApp/package.json Binner/Binner.Web/ClientApp/package-lock.json Binner.Web/ClientApp/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix Binner.Web/ClientApp

# --- Copy full source and build ---
COPY Binner/ .

RUN npm run build --prefix Binner.Web/ClientApp

RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish Binner.Web/Binner.Web.csproj \
      -c Release \
      -r linux-arm64 \
      -p:SelfContained=false \
      -p:PublishSingleFile=false \
      -p:PublishReadyToRun=false \
      --no-restore \
      -o /app/publish

# --- Runtime image ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0

RUN apt-get update && apt-get install -y --no-install-recommends libgdiplus \
    && rm -rf /var/lib/apt/lists/*

ENV BINNER_CONFIG=/app/appsettings.Unix.Production.json
ENV BINNER_NLOGCONFIG=/app/nlog.Unix.config

EXPOSE 8090
WORKDIR /app
COPY --from=build /app/publish .
CMD ["./Binner.Web"]
